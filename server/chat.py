"""
chat.py
-------
Interactive CLI for the medical patient simulator.

Usage:
    cd server
    python chat.py

Commands during consultation:
    vitals              show patient vitals
    hint                show age + gender only
    suggest             show next suggested question
    revealed            show symptoms confirmed so far
    diagnose <disease>  submit your diagnosis
    new                 start a new patient
    quit                exit
"""

import sys
import os
import textwrap

# Ensure server/ is on the path when run from outside the directory
sys.path.insert(0, os.path.dirname(__file__))

from inference import PatientSession


def run_chat():
    session = PatientSession.new()
    p = session.patient

    print(f"\n{'='*65}")
    print(f"  AI MEDICAL PATIENT SIMULATOR  (Qwen2.5-1.5B + LoRA + RAG)")
    print(f"{'='*65}")
    print("  vitals              — show patient vitals")
    print("  hint                — show age/gender only")
    print("  suggest             — show next suggested question")
    print("  revealed            — show symptoms uncovered so far")
    print("  diagnose <disease>  — submit your diagnosis")
    print("  new                 — new random patient")
    print("  quit                — exit")
    print(f"{'─'*65}")
    print("A new patient has arrived. Begin your consultation.")
    print(f"{'─'*65}")

    while True:
        try:
            raw = input("\nDoctor: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nConsultation ended.")
            break

        if not raw:
            continue

        cmd = raw.lower()

        if cmd == "quit":
            print("Consultation ended.")
            break

        if cmd == "new":
            run_chat()
            return

        if cmd == "hint":
            h = session.hint()
            print(f"  [{h['age']}-year-old {h['gender']}]")
            continue

        if cmd == "vitals":
            v = session.vitals()
            print(f"  BP:{v['BP']}  HR:{v['HR']}  Temp:{v['Temp']}  "
                  f"SpO2:{v['SpO2']}  RR:{v['RR']}  Pain:{v['Pain']}")
            continue

        if cmd == "suggest":
            q = session.suggest()
            print(f"  Suggested: {q}" if q else "  No more suggested questions.")
            continue

        if cmd == "revealed":
            r = session.revealed()
            print(f"  {r['summary']}")
            print(f"  Coverage: {r['coverage']}% of canonical symptoms")
            continue

        if cmd.startswith("diagnose "):
            submission = raw[9:].strip()
            result = session.diagnose(submission)
            reveal = result["reveal"]

            print(f"\n{'='*65}")
            print(f"  DIAGNOSIS REPORT")
            print(f"{'='*65}")
            print(f"  Your diagnosis : {submission}")
            print(f"  Result         : {result['result']}")
            print(f"  Questions asked: {result['turns_taken']}")
            print()
            print("  FULL DISEASE REVEAL:")
            print(f"  Disease    : {reveal['disease']}")
            print(f"  Canonical symptoms ({len(reveal['canonical'])}):")
            for sym in reveal["canonical"]:
                tick = "+" if sym in reveal["revealed"] else " "
                print(f"    [{tick}] {sym}")
            if reveal["treatments"]:
                print(f"  Treatments : {', '.join(reveal['treatments'])}")
            print(f"  Coverage   : {len(reveal['revealed'])}/{len(reveal['canonical'])} "
                  f"symptoms revealed ({reveal['coverage']*100:.0f}%)")
            print(f"{'='*65}")
            break

        # Normal doctor question — generate patient response
        print("  [thinking…]", end="\r")
        resp = session.chat(raw)
        resp_display = resp if resp else "[no response — try rephrasing]"
        print(f"\nPatient: {textwrap.fill(resp_display, 60, subsequent_indent='         ')}")


if __name__ == "__main__":
    run_chat()
