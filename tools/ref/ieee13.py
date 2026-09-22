"""Reference solution of the IEEE 13-node test feeder with OpenDSS.

Offline tool. Runs OpenDSS's IEEE13Nodeckt.dss (kept in tools/ref/ieee13/) through
OpenDSSDirect.py with the published regulator taps (10, 8, 11) fixed and the
ORIGINAL configuration 606 impedances (the ones the published results were computed
with; OpenDSS's file has a later-corrected 606, which it notes does not reproduce the
published results). Writes test/fixtures/ieee13-opendss.json with node voltages
(pu of 2401.78 V LN, and angle in degrees) per phase.

    python tools/ref/ieee13.py
"""
import json
import os

import opendssdirect as dss

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "test", "fixtures", "ieee13-opendss.json"))

dss.Text.Command("clear")
dss.Text.Command(f"compile [{os.path.join(HERE, 'ieee13', 'IEEE13Nodeckt.dss')}]")
# original 606 (Kersting) -- the published results use these values
dss.Text.Command(
    "edit linecode.mtx606 rmatrix=(0.7982 | 0.3192 0.7891 | 0.2849 0.3192 0.7982) "
    "xmatrix=(0.4463 | 0.0328 0.4041 | -0.0143 0.0328 0.4463) cmatrix=(257 | 0 257 | 0 0 257) units=mi"
)
dss.Text.Command("Transformer.Reg1.Taps=[1.0 1.0625]")
dss.Text.Command("Transformer.Reg2.Taps=[1.0 1.0500]")
dss.Text.Command("Transformer.Reg3.Taps=[1.0 1.06875]")
dss.Text.Command("Set Controlmode=OFF")
dss.Text.Command("Solve")

out = {
    "tool": "OpenDSS via OpenDSSDirect.py",
    "tool_version": dss.__version__,
    "engine": dss.Basic.Version(),
    "note": "IEEE13Nodeckt.dss, regulator taps fixed at 10/8/11, original config 606, distributed load at node 670 (1/3 of 632-671)",
    "nodes": {},
}
for bus in dss.Circuit.AllBusNames():
    dss.Circuit.SetActiveBus(bus)
    kvbase = dss.Bus.kVBase()
    nodes = dss.Bus.Nodes()
    va = dss.Bus.puVmagAngle()
    ph = {}
    for k, n in enumerate(nodes):
        ph["abc"[n - 1]] = {"pu": va[2 * k], "deg": va[2 * k + 1]}
    out["nodes"][bus] = {"kv_base_ln": kvbase, "phases": ph}
dss.Circuit.SetActiveElement("Vsource.source")
p = dss.CktElement.Powers()
out["source_kw"] = -sum(p[0:6:2])
out["source_kvar"] = -sum(p[1:6:2])
out["losses_kw"] = dss.Circuit.Losses()[0] / 1000
out["losses_kvar"] = dss.Circuit.Losses()[1] / 1000
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
for b in ["650", "rg60", "632", "633", "634", "645", "646", "671", "680", "684", "611", "652", "692", "675"]:
    print(b, {k: (round(v["pu"], 4), round(v["deg"], 2)) for k, v in out["nodes"][b]["phases"].items()})
print("source", out["source_kw"], out["source_kvar"], "losses", out["losses_kw"], out["losses_kvar"])
