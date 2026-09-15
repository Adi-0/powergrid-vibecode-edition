/**
 * The guided path.
 *
 * Everything else in this app is a place you can go. This is the one thing that
 * is a route, and it exists because the brief asks for a path through the model
 * for somebody who does not yet know what to be curious about.
 *
 * THE RULE IT FOLLOWS: nothing requires reading to be useful, so every step
 * DOES something — it moves the camera, changes the time, switches a machine
 * out, starts a motor — and then says one short thing about what just happened.
 * A step whose text could be deleted without the reader losing anything is a
 * step that has earned its place; a step whose ACTION could be deleted has not.
 *
 * It is also not a lecture: every control the path touches stays exactly where
 * it is when the reader leaves the path, so they carry on from wherever they
 * got to rather than being returned to a start.
 */

import { LevelId } from '../render/style.js';
import { FaultKind } from '../core/fault.js';
import { MotorState } from '../sim/motor-start.js';
import { StartMethod } from '../core/motor.js';
import { Season } from '../sim/profiles.js';
import { term } from './tooltip.js';

export interface GuideHost {
  goTo: (id: LevelId) => void;
  setHour: (hour: number) => void;
  setSeason: (season: Season) => void;
  setStorage: (inService: boolean) => void;
  setAppliance: (id: string | null) => void;
  setMotor: (state: MotorState, method: StartMethod, site: string) => void;
  setFault: (busId: string | null, kind: FaultKind) => void;
  openPanel: (id: 'solver' | 'reliability' | 'honesty' | 'glossary' | null) => void;
  onLeave: () => void;
}

interface GuideStep {
  title: string;
  /**
   * What to do when the reader arrives at this step.
   *
   * Every one of these sets the WHOLE state it needs rather than a difference
   * from the step before, because the dots along the bottom let a reader jump
   * straight to any step. A step that assumed it was arrived at in order would
   * show its text against somebody else's picture.
   */
  enter: (h: GuideHost) => void;
  /** What to say about it. HTML, because the glossary links belong here. */
  text: () => string;
}

const STEPS: GuideStep[] = [
  {
    title: 'All of it at once',
    enter: (h) => {
      h.openPanel(null);
      h.setFault(null, 'single-line-to-ground');
      h.setMotor('off', 'across-the-line', 'industrial');
      h.setAppliance(null);
      h.setStorage(true);
      h.setSeason('summer');
      h.setHour(18);
      h.goTo('system');
    },
    text: () => `Six in the evening in July. Every line on this drawing is a real ` +
      `circuit carrying a real number of megawatts, and the marks travelling ` +
      `along them move in the direction the power does. How heavy a line is ` +
      `says what ${term('ansi-c84-1', 'voltage')} it runs at — never what ` +
      `colour it is, because colour here means only that something is wrong.`,
  },
  {
    title: 'Four in the morning',
    enter: (h) => {
      h.openPanel(null);
      h.setSeason('summer');
      h.setHour(4);
      h.goTo('system');
    },
    text: () => `The same state, fourteen hours earlier. Demand has fallen by a ` +
      `third, the expensive machines have stopped, and the price at the top of ` +
      `the screen has collapsed. Nothing here was scripted: the ` +
      `${term('merit-order', 'dispatch')} was re-run and the ` +
      `${term('power-flow', 'power flow')} re-solved for this hour.`,
  },
  {
    title: 'Who sets the price',
    enter: (h) => {
      h.openPanel(null);
      h.setSeason('summer');
      h.setHour(19);
      h.goTo('system');
    },
    text: () => `The evening peak. At the bottom of the screen is the ` +
      `${term('marginal-unit', 'marginal unit')} — the last and most expensive ` +
      `machine needed to meet demand. Everybody who generates is paid what IT ` +
      `costs, which is the single strangest and most important fact about how ` +
      `electricity is sold.`,
  },
  {
    title: 'A spring afternoon, and the batteries',
    enter: (h) => {
      h.openPanel(null);
      h.setSeason('spring');
      h.setHour(13);
      h.setStorage(true);
      h.goTo('system');
    },
    text: () => `Mild spring, one o'clock: the sun produces more than the state ` +
      `consumes. Every fuel-burning unit has backed down to its minimum and ` +
      `several gigawatts are going into batteries. Now take them out of ` +
      `service with the button on the left and watch the price for the whole ` +
      `day change shape.`,
  },
  {
    title: 'Down to a substation',
    enter: (h) => {
      h.openPanel(null);
      h.setSeason('summer');
      h.setHour(18);
      h.setStorage(true);
      h.goTo('substation');
    },
    text: () => `Eden Vale, south of San Jose. This is the ` +
      `${term('single-line-diagram', 'single-line diagram')} — the drawing ` +
      `every engineer works from, which throws away the physical arrangement ` +
      `and keeps only what is connected to what. Slide the control on the left ` +
      `from Diagram to Yard and watch it stand up into the thing that is ` +
      `actually there.`,
  },
  {
    title: 'The street',
    enter: (h) => {
      h.openPanel(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.setFault(null, 'single-line-to-ground');
      h.goTo('feeder');
    },
    text: () => `Three kilometres of distribution feeder at the height the wires ` +
      `hang. The plot below is voltage against distance — the single most ` +
      `useful picture in distribution engineering. You can see it fall away ` +
      `from the substation, jump where the ${term('voltage-regulator', 'regulator')} ` +
      `lifts it, and hold flat past the ${term('capacitor-bank', 'capacitor bank')}.`,
  },
  {
    title: 'Somebody starts a motor',
    enter: (h) => {
      h.openPanel(null);
      h.setFault(null, 'single-line-to-ground');
      h.goTo('feeder');
      h.setMotor('starting', 'across-the-line', 'far-end');
    },
    text: () => `Two hundred horsepower at the far end of the feeder. At ` +
      `standstill a motor is a short-circuited transformer: it draws six times ` +
      `its running current at a power factor of 0.2, and the whole street dims. ` +
      `The dotted line on the profile is where the voltage was a second ago. ` +
      `Try the reduced-voltage starters and watch what they cost in torque.`,
  },
  {
    title: 'The wall outlet',
    enter: (h) => {
      h.openPanel(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.setAppliance(null);
      h.goTo('service');
    },
    text: () => `The end of the chain: 240 volts across two conductors, 120 from ` +
      `either one to the centre tap. Switch on the car charger. Demand for the ` +
      `whole state rises by exactly 11.5 kW, losses by about 2.7, generation by ` +
      `the sum of the two — and the voltage at this socket falls by three ` +
      `quarters of a volt, because it is all one network and one solve.`,
  },
  {
    title: 'Where it came from',
    enter: (h) => {
      h.openPanel(null);
      h.setAppliance(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.goTo('plant');
    },
    text: () => `A combined-cycle power station: a gas turbine, and behind it a ` +
      `boiler making steam out of the exhaust to drive a second turbine. The ` +
      `widths of the streams are proportional to the energy in them, which is ` +
      `why the one going into the condenser is so uncomfortably wide. That is ` +
      `${term('heat-rate', 'thermal efficiency')}, drawn.`,
  },
  {
    title: 'Inside the machine',
    enter: (h) => { h.openPanel(null); h.goTo('machine'); },
    text: () => `One synchronous generator in cross-section, with the rotor drawn ` +
      `at the ${term('load-angle', 'load angle')} it is actually running at. ` +
      `The panel beside it is the ${term('capability-curve', 'capability curve')}: ` +
      `every combination of real and reactive power the machine can hold, and ` +
      `which limit it is up against right now.`,
  },
  {
    title: 'A fault, and what clears it',
    enter: (h) => {
      h.openPanel(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.goTo('feeder');
      h.setFault('FDR_L3B', 'single-line-to-ground');
    },
    text: () => `One phase touching earth on Cherry Lane. The fault current is ` +
      `computed from ${term('symmetrical-components', 'symmetrical components')} ` +
      `and the curves show which device reaches its operating time first. The ` +
      `fuse on that lateral clears it, and nobody else on the feeder notices — ` +
      `which is what ${term('coordination', 'coordination')} means.`,
  },
  {
    title: 'How often the lights go out',
    enter: (h) => {
      h.setFault(null, 'single-line-to-ground');
      h.goTo('feeder');
      h.openPanel('reliability');
    },
    text: () => `${term('saifi', 'SAIFI')} and ${term('saidi', 'SAIDI')} are what ` +
      `a distribution utility is judged on, and they are not weather: they are ` +
      `the arithmetic consequence of how much wire is in the air and where the ` +
      `devices that can isolate a piece of it are. Move the three switches and ` +
      `watch every index change — including the ones that get worse.`,
  },
  {
    title: 'How any of this was worked out',
    enter: (h) => {
      h.setFault(null, 'single-line-to-ground');
      h.setMotor('off', 'across-the-line', 'industrial');
      h.goTo('system');
      h.openPanel('solver');
    },
    text: () => `There is no formula for a power flow. There is a guess, a ` +
      `measure of how wrong it is, and a way of improving it — and the plot ` +
      `here is that error shrinking, squaring itself at every step. Where it ` +
      `jumps back up, a machine ran out of reactive capability and the problem ` +
      `itself changed.`,
  },
  {
    title: 'What this leaves out',
    enter: (h) => { h.goTo('system'); h.openPanel('honesty'); },
    text: () => `Everything the model does not represent, in one list, always ` +
      `available from the button at the bottom of the screen. The network is a ` +
      `reconstruction and not a copy; the phases are balanced except where ` +
      `faults are being computed; the reliability figures come from planning ` +
      `rates and not from history. Knowing where a model stops is most of ` +
      `knowing how to read one.`,
  },
];

export class Guide {
  readonly element: HTMLElement;
  private readonly host: GuideHost;
  private index = 0;
  private open = false;

  constructor(host: GuideHost) {
    this.host = host;
    this.element = document.createElement('aside');
    this.element.className = 'panel panel--guide';
    this.element.style.display = 'none';
    this.element.innerHTML =
      `<div class="panel__head">` +
      `<span class="panel__title" data-role="title"></span>` +
      `<span class="panel__sub" data-role="count"></span>` +
      `<button class="panel__close" title="Leave the path">×</button>` +
      `</div><div class="panel__body"></div>` +
      `<div class="guide__foot">` +
      `<button class="btn btn--quiet" data-role="back">Back</button>` +
      `<div class="guide__dots" data-role="dots"></div>` +
      `<button class="btn" data-role="next">Next</button>` +
      `</div>`;

    this.element.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      if (b.classList.contains('panel__close')) this.close();
      else if (b.dataset.role === 'back') this.go(this.index - 1);
      else if (b.dataset.role === 'next') {
        if (this.index === STEPS.length - 1) this.close();
        else this.go(this.index + 1);
      } else if (b.dataset.step !== undefined) this.go(Number(b.dataset.step));
    });
  }

  get isOpen(): boolean { return this.open; }

  start(): void {
    this.open = true;
    this.element.style.display = '';
    this.go(0);
  }

  close(): void {
    this.open = false;
    this.element.style.display = 'none';
    this.host.onLeave();
  }

  toggle(): void {
    if (this.open) this.close(); else this.start();
  }

  private go(index: number): void {
    this.index = Math.max(0, Math.min(STEPS.length - 1, index));
    const step = STEPS[this.index];
    step.enter(this.host);
    this.render();
  }

  private render(): void {
    const step = STEPS[this.index];
    (this.element.querySelector('[data-role="title"]') as HTMLElement)
      .textContent = step.title;
    (this.element.querySelector('[data-role="count"]') as HTMLElement)
      .textContent = `${this.index + 1} of ${STEPS.length}`;
    (this.element.querySelector('.panel__body') as HTMLElement)
      .innerHTML = `<p class="note">${step.text()}</p>`;
    (this.element.querySelector('[data-role="back"]') as HTMLElement)
      .toggleAttribute('disabled', this.index === 0);
    (this.element.querySelector('[data-role="next"]') as HTMLElement)
      .textContent = this.index === STEPS.length - 1 ? 'Done' : 'Next';
    (this.element.querySelector('[data-role="dots"]') as HTMLElement).innerHTML =
      STEPS.map((s, i) =>
        `<button class="guide__dot" data-step="${i}" ` +
        `aria-pressed="${i === this.index}" title="${escapeAttr(s.title)}"></button>`
      ).join('');
  }
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
