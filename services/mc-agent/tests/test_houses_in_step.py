"""The MC names each room by the same house name the TV shows (packages/crowd/packs/acts.json, published from packs.ts).
They drifted once: after the trademark renames the MC still said "Prithvi" on a card (Google TV, 2026-10-13)."""

import json
from pathlib import Path

from mc_agent.personas import HOUSES

PACKS = Path(__file__).resolve().parents[3] / "packages" / "crowd" / "packs" / "acts.json"


def test_every_house_name_matches_the_published_packs():
    packs = json.loads(PACKS.read_text())
    tv = {(act["id"], v["id"]): v["house"] for act in packs["acts"] for v in act["venues"]}
    assert HOUSES == tv
