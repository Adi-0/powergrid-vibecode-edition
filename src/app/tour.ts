import type { App } from './app';
import { rich } from '../ui/glossary';
import { data, el, qty } from '../ui/quantity';

/**
 * The guided route: about ten minutes from the whole state to a wall outlet, a plant, a
 * generator and a fault, each stop a real place in the zoom tree with a real
 * perturbation. Skippable at any point and re-enterable where it was left. Every stop
 * sets its own scene from wherever the sheet is, so Back, Next and Resume all work.
 */
interface Stop {
  title: string;
  text: string;
  go: (app: App) => Promise<void>;
}

const EVENING = 76;
const NOON = 50;

async function reset(app: App, keepFault = false): Promise<void> {
  app.closeSidePanels();
  app.inspector.toggleWorking(false);
  if (!keepFault) app.restore('all');
  app.select(null);
}

async function at(app: App, t: number): Promise<void> {
  if (app.t !== t) app.setTime(t);
  await app.solved();
}

export const STOPS: Stop[] = [
  {
    title: 'A power system, drawn',
    text: 'This is California’s [[transmission]] grid at the evening peak, drawn like a technical drawing. The heavier the line, the higher its [[voltage]]; the chevrons show which way [[real-power|real power]] flows, and their size how much. Every number on the sheet comes from a solved [[power-flow|power flow]].',
    go: async (app) => {
      await reset(app);
      await app.navigate([]);
      await at(app, EVENING);
    },
  },
  {
    title: 'Noon, and the duck',
    text: 'Now it is midday. Rooftop and utility solar carry much of the state, so the rest of the fleet has little to do — and it must ramp up hard as the sun sets. That shape, the [[duck-curve|duck curve]], emerges from the day’s dispatch; nothing here is scripted. Drag the strip below to move through the day.',
    go: async (app) => {
      await reset(app);
      await app.navigate([]);
      await at(app, NOON);
    },
  },
  {
    title: 'One line, in numbers',
    text: 'Back at the peak, one of the big lines up the Central Valley is selected. Its working is shown: the [[pi-model|π model]], the voltages at both ends, and the arithmetic that gives its flow — every step reproducible by hand, next to the solver’s own value.',
    go: async (app) => {
      await reset(app);
      await app.navigate([]);
      await at(app, EVENING);
      app.select({ kind: 'branch', index: app.grid.branches.findIndex((b) => b.id === 'MIDWAY–VINCENT 500 #1') });
      app.inspector.toggleWorking(true);
    },
  },
  {
    title: 'Take a line out',
    text: 'A circuit into San Diego has tripped. The power flow is solved again at once: the power it carried finds other paths, and some of them are now working harder. If a line goes over its [[rating]] it turns the signal colour. Operators would redispatch within minutes.',
    go: async (app) => {
      await reset(app);
      await app.navigate([]);
      await at(app, EVENING);
      const k = app.grid.branches.findIndex((b) => b.id === 'SANTIAGO–SAN_ONOFRE 230 #1');
      app.trip(k);
      app.select({ kind: 'branch', index: k });
      await app.solved();
    },
  },
  {
    title: 'Every node is a place',
    text: 'Zoom into any node on the map — scroll, pinch, or double-click it — and it unfolds into what it stands for. This is Tesla, where the state’s highest-voltage backbone meets the Bay Area’s [[transmission]] ring: each circuit arrives on its own bay, [[transformer|transformers]] join the two [[bus|buses]], and the chevrons show every megawatt in and out. Zoom back out and it folds into its node again.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['site']);
    },
  },
  {
    title: 'A region, in layers',
    text: 'Another way to look at the map: the Bay Area pulled apart by voltage. Each layer carries every circuit at that voltage, transformers join the layers, generation rises from the ground and demand descends to it. Zoom out and it folds back into the map.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['region']);
    },
  },
  {
    title: 'A neighbourhood',
    text: 'Evergreen is a small node in east San José. Zoomed into, it is a neighbourhood: the substation at the head of one [[feeder]], and the feeder down the street — a three-phase trunk, fused side streets, a [[recloser]], a [[regulator|voltage regulator]], pole-top transformers and homes. It is solved phase by phase, unbalanced, and coupled to the transmission solution at the substation.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['feeder']);
    },
  },
  {
    title: 'A substation',
    text: 'Zoom into the substation and its yard unfolds: the [[subtransmission]] lines from Metcalf arrive on a gantry, pass switches and breakers onto a [[bus]], and a [[transformer]] steps the voltage down for the neighbourhood’s feeders.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['substation']);
    },
  },
  {
    title: 'Inside a transformer',
    text: 'Zoom into the substation’s [[transformer]] and it opens. The arrows in the steel [[core]] are its [[flux]], alternating with the voltage, one phase per limb. Every [[turn]] of the [[winding|windings]] round a limb gets the same voltage from it, so the windings’ voltages are in the ratio of their turns, drawn to scale. What the windings lose as heat, the oil carries up and out to the radiators: the chevrons.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['bank']);
      await app.solved();
    },
  },
  {
    title: 'A breaker opens',
    text: 'One of the three circuits from Metcalf, at its [[breaker]], its nearest pole cut open. It is opening now, many times slower than life: the contacts part, the current goes on across the gap as an [[arc]], gas is blown through the nozzle, and at a [[current-zero|current zero]] the arc goes out. The chart shows each phase going out at its own zero. Then the network is solved again without the circuit, and the other two carry its share.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['breaker60']);
      await app.solved();
      app.openTopBreaker();
    },
  },
  {
    title: 'Inside a capacitor',
    text: 'A [[capacitor-bank|capacitor bank]] at Tesla, and one of its cans opened. Inside: two long sheets of foil, wound up with plastic film between. Charge gathers on them, + on one and − on the other, and they swap every half cycle; energy flows in and back out twice a cycle, and on balance none is kept. What the bank supplies is [[reactive-power|reactive power]], the to-and-fro current motors need. Zoom out to the bank and switch a step out: the network is solved again, and the bus voltage falls.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['capunit']);
      await app.solved();
    },
  },
  {
    title: 'To the wall outlet',
    text: 'One pole-top transformer, its homes, and one wall [[outlet]] with a hair dryer plugged in. The inspector traces its voltage all the way back to the transmission bus; the working shows the last few volts by Ohm’s law.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['service']);
      await app.solved();
      app.select({ kind: 'dist', what: 'outlet', id: 'OUTLET' });
      app.inspector.toggleWorking(true);
    },
  },
  {
    title: 'A power plant',
    text: 'Moss Landing, zoomed into twice: its switchyard, then the [[combined-cycle|combined-cycle]] plant beside it. Every chevron is megawatts, whatever form it takes — gas in, hot exhaust, steam, shaft work, electricity out, and heat to the stacks and the sea. The inspector shows the energy balance closing to the watt.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['plant']);
    },
  },
  {
    title: 'Inside a generator',
    text: 'One gas turbine’s generator, cut open. Its inspector draws the [[phasor|phasors]] and the [[capability-curve|capability curve]]. Try Raise excitation: the power flow re-solves and the operating point moves — more reactive power out.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['machine']);
    },
  },
  {
    title: 'Lose a plant',
    text: 'The whole plant has tripped. For a few seconds every spinning machine in the West slows together — [[inertia]] — until [[governor|governors]] catch it. The chart shows the frequency’s lowest point, the [[nadir]], and where it settles. The flows drawn are after the governors have acted.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['plant']);
      await app.solved();
      app.tripPlant('ML1');
      await app.solved();
    },
  },
  {
    title: 'A fault on the feeder',
    text: 'Something has touched the line at the end of a side street and stayed. Watch the protection act in its real sequence: the recloser opens and closes twice, then the fuse clears the fault; only that street is left without supply. The inspector plots each device’s [[tcc|time–current curve]] against the fault current.',
    go: async (app) => {
      await reset(app);
      await app.navigate(['feeder']);
      await app.solved();
      const lat = app.feederModel().layout.laterals.find((l) => l.id === 'L10')!;
      app.faultFeeder(lat.nodes[lat.nodes.length - 1]!, true);
    },
  },
  {
    title: 'What is simplified, and what the words mean',
    text: 'Everything here is physically faithful but not a replica of real assets. This panel lists, for whatever is on the sheet, what the model leaves out and what the full treatment would be. Every term of art is in the Glossary. The tour ends here; everything is yours to explore.',
    go: async (app) => {
      await reset(app);
      await app.navigate([]);
      await at(app, EVENING);
      app.openHonesty();
    },
  },
];

const KEY = 'grid-atlas.tour';

export class Tour {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private count: HTMLElement;
  private back: HTMLButtonElement;
  private next: HTMLButtonElement;
  index = 0;
  busy = false;
  /** How many stops the route has. */
  readonly stops = STOPS.length;

  constructor(
    parent: HTMLElement,
    private app: App,
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'panel tour';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Guided tour');
    const h = document.createElement('header');
    this.count = document.createElement('span');
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.title = 'Leave the tour (it will remember where you were)';
    close.addEventListener('click', () => this.leave());
    h.append(this.count, close);
    const b = document.createElement('div');
    b.className = 'body';
    this.title = document.createElement('h2');
    this.body = document.createElement('p');
    const bar = document.createElement('div');
    bar.className = 'actions';
    this.back = document.createElement('button');
    this.back.textContent = 'Back';
    this.back.addEventListener('click', () => void this.goTo(this.index - 1));
    this.next = document.createElement('button');
    this.next.addEventListener('click', () => void (this.index >= STOPS.length - 1 ? this.finish() : this.goTo(this.index + 1)));
    bar.append(this.back, this.next);
    b.append(this.title, this.body, bar);
    this.root.append(h, b);
    parent.appendChild(this.root);
  }

  /** Where the reader left off (0: not started). */
  get saved(): number {
    try {
      const v = Number(localStorage.getItem(KEY));
      return Number.isFinite(v) && v > 0 && v < STOPS.length ? v : 0;
    } catch {
      return 0;
    }
  }

  private save(i: number | null): void {
    try {
      if (i === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(i));
    } catch {
      // storage unavailable: the tour simply starts from the beginning next time
    }
  }

  open(): void {
    void this.goTo(this.saved);
  }

  async goTo(i: number): Promise<void> {
    if (this.busy || i < 0 || i >= STOPS.length) return;
    this.busy = true;
    this.index = i;
    this.save(i);
    this.root.hidden = false;
    this.root.parentElement?.classList.add('touring');
    this.render(true);
    try {
      await STOPS[i]!.go(this.app);
    } catch {
      // a stop that could not finish setting its scene still shows its words
    }
    this.busy = false;
    this.render(false);
  }

  private render(pending: boolean): void {
    const s = STOPS[this.index]!;
    this.count.replaceChildren(
      document.createTextNode('Guided tour · stop '),
      el(qty(this.index + 1, '', data('tour.stop'), { digits: 0 })),
      document.createTextNode(' of '),
      el(qty(STOPS.length, '', data('tour.stops'), { digits: 0 })),
    );
    this.title.textContent = s.title;
    this.body.replaceChildren(rich(s.text));
    this.back.disabled = pending || this.index === 0;
    this.next.disabled = pending;
    this.next.textContent = pending ? 'Setting the scene…' : this.index >= STOPS.length - 1 ? 'Finish' : 'Next';
  }

  leave(): void {
    this.root.hidden = true;
    this.root.parentElement?.classList.remove('touring');
  }

  finish(): void {
    this.save(null);
    this.root.hidden = true;
    this.root.parentElement?.classList.remove('touring');
    this.app.closeSidePanels();
  }
}
