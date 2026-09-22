"""Reference AC power-flow solutions for the IEEE 14- and 30-bus cases.

Offline tool. Loads pandapower's built-in copies of the MATPOWER cases (the
canonical machine-readable form of the IEEE Common Data Format cases), solves them
with Newton-Raphson (flat start, 1e-10 MVA tolerance, reactive limits not enforced -
MATPOWER's default), and writes test/fixtures/pf-<case>.json containing:

  * the exact per-unit arrays pandapower solved (its internal MATPOWER-format
    "ppc": bus, branch, gen), so our solver reads identical input data;
  * pandapower's solution (|V|, angle, bus injections, branch flows);
  * the values published in the MATPOWER case file (rounded as published), when the
    file carries a solution, for an independent coarse check.

    python tools/ref/ieee_pf.py <dir-with-matpower-.m-files>

MATPOWER case files: https://github.com/MATPOWER/matpower/tree/master/data
"""
import json
import os
import re
import sys

import numpy as np
import pandapower as pp
import pandapower.networks as pn

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "test", "fixtures"))

CASES = [("case14", pn.case14), ("case30", pn.case30), ("case_ieee30", pn.case_ieee30)]


def published(path):
    txt = open(path).read()
    m = re.search(r"mpc\.bus\s*=\s*\[(.*?)\];", txt, re.S)
    vm, va = [], []
    for line in m.group(1).split("\n"):
        line = line.split("%")[0].strip().rstrip(";").strip()
        if line:
            v = [float(x) for x in line.split()]
            vm.append(v[7])
            va.append(v[8])
    carries_solution = not (all(x == 1.0 for x in vm) and all(x == 0.0 for x in va))
    return {"vm_pu": vm, "va_deg": va, "carries_solution": carries_solution}


def main(src):
    os.makedirs(OUT, exist_ok=True)
    for name, fn in CASES:
        net = fn()
        pp.runpp(
            net,
            algorithm="nr",
            init="flat",
            tolerance_mva=1e-10,
            enforce_q_lims=False,
            calculate_voltage_angles=True,
            numba=False,
        )
        ppc = net._ppc
        assert list(net._pd2ppc_lookups["bus"][: len(net.bus)]) == list(range(len(net.bus)))
        bus = ppc["bus"][:, :13].copy()
        # Input columns only: the solver starts flat; Vm/Va columns are overwritten
        # by pandapower with its solution, so reset them to a flat start.
        vm_res = bus[:, 7].copy()
        va_res = bus[:, 8].copy()
        bus[:, 7] = 1.0
        bus[:, 8] = 0.0
        branch = ppc["branch"][:, :11].real.copy()
        br_res = ppc["branch"][:, 13:17].real.copy()  # PF QF PT QT (MW/MVAr)
        gen = ppc["gen"][:, :10].real.copy()
        gen_res = gen[:, 1:3].copy()  # Pg, Qg solved
        fixture = {
            "case": name,
            "source": f"MATPOWER data/{name}.m via pandapower.networks.{name}()",
            "tool": "pandapower",
            "tool_version": pp.__version__,
            "solver": "Newton-Raphson, flat start, tolerance 1e-10 MVA, reactive limits not enforced",
            "precision_note": (
                "Reference and implementation read identical per-unit input and both converge "
                "to ~1e-10, so agreement is supported to ~1e-8 pu; tests assert 1e-6 pu and "
                "1e-4 deg. Published Vm/Va are rounded to 3 decimals (pu) and 2 decimals "
                "(deg): compare to those at 5e-4 pu and 5e-3 deg only."
            ),
            "baseMVA": float(ppc["baseMVA"]),
            "columns": {
                "bus": "BUS_I TYPE PD QD GS BS AREA VM VA BASE_KV ZONE VMAX VMIN (0-based bus ids)",
                "branch": "F_BUS T_BUS BR_R BR_X BR_B RATE_A RATE_B RATE_C TAP SHIFT BR_STATUS",
                "gen": "GEN_BUS PG QG QMAX QMIN VG MBASE GEN_STATUS PMAX PMIN",
            },
            "bus": bus.tolist(),
            "branch": np.nan_to_num(branch).tolist(),
            "gen": np.nan_to_num(gen).tolist(),
            "published": published(os.path.join(src, name + ".m")),
            "result": {
                "vm_pu": vm_res.tolist(),
                "va_deg": va_res.tolist(),
                "gen_pg_mw": gen_res[:, 0].tolist(),
                "gen_qg_mvar": gen_res[:, 1].tolist(),
                "branch_pf_mw": br_res[:, 0].tolist(),
                "branch_qf_mvar": br_res[:, 1].tolist(),
                "branch_pt_mw": br_res[:, 2].tolist(),
                "branch_qt_mvar": br_res[:, 3].tolist(),
            },
        }
        path = os.path.join(OUT, f"pf-{name}.json")
        with open(path, "w") as f:
            json.dump(fixture, f, indent=1)
        pub = fixture["published"]
        dv = max(abs(a - b) for a, b in zip(vm_res, pub["vm_pu"])) if pub["carries_solution"] else float("nan")
        print(f"{path}: {len(bus)} buses, {len(branch)} branches; max |V-Vpub| = {dv:.2e}")


if __name__ == "__main__":
    main(sys.argv[1])
