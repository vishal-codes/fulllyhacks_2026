"""
model.py
--------
Loads Qwen2.5-1.5B-Instruct + LoRA patient adapter exactly once at startup.
All patient-response generation goes through generate_patient_response().

Device priority: MPS (Apple Silicon) > CPU  — no bitsandbytes required.
"""

import re
import torch
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel

_HERE = Path(__file__).parent
ADAPTER_PATH = str(_HERE / "qwen-patient-adapter")
MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"

_tokenizer: AutoTokenizer | None = None
_model: PeftModel | None = None
_stop_ids: list[int] = []
DEVICE: torch.device | None = None


# ---------------------------------------------------------------------------
# Public: load once at startup
# ---------------------------------------------------------------------------


def load() -> None:
    """Load tokenizer + base model + LoRA adapter into memory. Idempotent."""
    global _tokenizer, _model, _stop_ids, DEVICE

    if _model is not None:
        return  # already loaded

    DEVICE = _get_device()
    dtype = torch.float16 if DEVICE.type == "mps" else torch.float32

    print(f"[model] Device: {DEVICE}  dtype: {dtype}")
    print(f"[model] Loading tokenizer from {ADAPTER_PATH} …")

    tok = AutoTokenizer.from_pretrained(ADAPTER_PATH)
    tok.padding_side = "right"
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    print(f"[model] Loading base model {MODEL_ID} …")
    base = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
    )
    base = base.to(DEVICE)

    print(f"[model] Applying LoRA adapter from {ADAPTER_PATH} …")
    mdl = PeftModel.from_pretrained(base, ADAPTER_PATH)
    mdl.eval()

    # Build stop-token IDs
    stop_set: set[int] = {tok.eos_token_id} - {None}
    for s in ["<|im_end|>", "<|im_start|>", "\n<|im"]:
        enc = tok.encode(s, add_special_tokens=False)
        if enc:
            stop_set.add(enc[0])
    _stop_ids = list(stop_set)

    _tokenizer = tok
    _model = mdl
    print(f"[model] Ready | {mdl.num_parameters():,} params | device: {DEVICE}")


# ---------------------------------------------------------------------------
# Public: generate one patient response
# ---------------------------------------------------------------------------


def generate_patient_response(
    history: list[dict],
    patient: dict,
    max_new_tokens: int = 120,
) -> str:
    """
    Run the fine-tuned model on the current history and return the patient's
    response as a plain string.

    Includes a post-generation identity guard: if the doctor asked for the
    patient's name or age and the model forgot them, replace with the ground truth.
    """
    assert _model is not None, "Call model.load() before generating."

    prompt = _build_prompt(history)
    enc = _tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
    input_ids = enc["input_ids"].to(DEVICE)
    attn_mask = enc["attention_mask"].to(DEVICE)
    prompt_len = input_ids.shape[-1]

    with torch.no_grad():
        out = _model.generate(
            input_ids=input_ids,
            attention_mask=attn_mask,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=0.3,
            top_p=0.9,
            repetition_penalty=1.15,
            no_repeat_ngram_size=3,
            eos_token_id=_stop_ids if _stop_ids else _tokenizer.eos_token_id,
            pad_token_id=_tokenizer.pad_token_id,
        )

    raw = _tokenizer.decode(out[0][prompt_len:], skip_special_tokens=True)
    resp = _clean(raw)

    # Identity guard
    last_user = next(
        (m["content"] for m in reversed(history) if m["role"] == "user"), ""
    )
    if re.search(r"\bname\b|\bhow old\b|\bage\b", last_user, re.I):
        rl = resp.lower()
        if not (patient["first"].lower() in rl and str(patient["age"]) in rl):
            resp = f"My name is {patient['name']} and I am {patient['age']} years old."

    return resp


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _build_prompt(history: list[dict]) -> str:
    parts = []
    for m in history:
        parts.append(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>")
    parts.append("<|im_start|>assistant\n")
    return "\n".join(parts)


def _clean(text: str) -> str:
    for marker in ["<|im_end|>", "<|im_start|>", "<|endoftext|>",
                   "Doctor:", "\nUser:", "\nAssistant:"]:
        if marker in text:
            text = text.split(marker)[0]
    return text.strip()
