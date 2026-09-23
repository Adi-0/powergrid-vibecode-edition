"""Short-circuit impedance matrices of the IEEE 13-node feeder, from OpenDSS fault study.

Offline tool. Compiles OpenDSS's IEEE13Nodeckt.dss (tools/ref/ieee13/) with the
original configuration 606 (as tools/ref/ieee13.py does), the regulators at neutral tap
and their control off, and every load and capacitor disabled (a fault calculation
neglects load). Solves in fault-study mode and writes, for each bus, its nodes and the
Thevenin (short-circuit) impedance matrix seen there, ohms:

    python tools/ref/ieee13_zsc.py   ->   test/fixtures/ieee13-zsc.json
"""
import json
import os

import opendssdirect as dss

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "test", "fixtures", "ieee13-zsc.json"))

dss.Text.Command("clear")
dss.Text.Command(f"compile [{os.path.join(HERE, 'ieee13', 'IEEE13Nodeckt.dss')}]")
dss.Text.Command(
    "edit linecode.mtx606 rmatrix=(0.7982 | 0.3192 0.7891 | 0.2849 0.3192 0.7982) "
    "xmatrix=(0.4463 | 0.0328 0.4041 | -0.0143 0.0328 0.4463) cmatrix=(257 | 0 257 | 0 0 257) units=mi"
)
for r in ("Reg1", "Reg2", "Reg3"):
    dss.Text.Command(f"Transformer.{r}.Taps=[1.0 1.0]")
dss.Text.Command("Set Controlmode=OFF")
dss.Text.Command("Batchedit Load..* enabled=false")
dss.Text.Command("Batchedit Capacitor..* enabled=false")
dss.Text.Command("Set mode=faultstudy")
dss.Text.Command("Solve")

out = {"tool": f"OpenDSS via OpenDSSDirect.py {dss.__version__}", "buses": {}}
for name in dss.Circuit.AllBusNames():
    dss.Circuit.SetActiveBus(name)
    nodes = list(dss.Bus.Nodes())
    z = dss.Bus.ZscMatrix()
    n = len(nodes)
    m = [[[z[2 * (i * n + j)], z[2 * (i * n + j) + 1]] for j in range(n)] for i in range(n)]
    out["buses"][name] = {"nodes": nodes, "zsc": m, "kvBaseLN": dss.Bus.kVBase()}
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(out["tool"], sorted(out["buses"].keys()))
