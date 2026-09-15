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
    text: () => `Six in the evening in July. The marks move the way the power ` +
      `does. Heavier line, higher ${term('ansi-c84-1', 'voltage')}. Colour is ` +
      `reserved for faults.`,
  },
  {
    title: 'Four in the morning',
    enter: (h) => {
      h.openPanel(null);
      h.setSeason('summer');
      h.setHour(4);
      h.goTo('system');
    },
    text: () => `Fourteen hours earlier. Demand down a third, the expensive ` +
      `machines stopped, the price collapsed. Re-${term('merit-order', 'dispatched')} ` +
      `and re-solved, not replayed.`,
  },
  {
    title: 'Who sets the price',
    enter: (h) => {
      h.openPanel(null);
      h.setSeason('summer');
      h.setHour(19);
      h.goTo('system');
    },
    text: () => `The evening peak. Along the bottom: the ` +
      `${term('marginal-unit', 'marginal unit')}, the last machine needed. ` +
      `Everyone generating is paid what it costs.`,
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
    text: () => `Spring, one o'clock. The sun is making more than the state ` +
      `uses and the surplus is going into batteries. Take them out with the ` +
      `button on the left.`,
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
    text: () => `Eden Vale, south of San Jose, as a ` +
      `${term('single-line-diagram', 'single-line diagram')}: what is connected ` +
      `to what, and nothing else. Slide from Diagram to Yard.`,
  },
  {
    title: 'The street',
    enter: (h) => {
      h.openPanel(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.setFault(null, 'single-line-to-ground');
      h.goTo('feeder');
    },
    text: () => `Three kilometres of feeder. Below: voltage against distance. ` +
      `It sags, the ${term('voltage-regulator', 'regulator')} lifts it, the ` +
      `${term('capacitor-bank', 'capacitor bank')} holds it.`,
  },
  {
    title: 'Somebody starts a motor',
    enter: (h) => {
      h.openPanel(null);
      h.setFault(null, 'single-line-to-ground');
      h.goTo('feeder');
      h.setMotor('starting', 'across-the-line', 'far-end');
    },
    text: () => `Two hundred horsepower, six times its running current, and ` +
      `the street dims. The dotted line is where the voltage was a second ago. ` +
      `Try the other starters.`,
  },
  {
    title: 'The wall outlet',
    enter: (h) => {
      h.openPanel(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.setAppliance(null);
      h.goTo('service');
    },
    text: () => `240 volts across two conductors, 120 to the centre tap. ` +
      `Switch on the car charger: state demand rises 11.5 kW, generation 14.2, ` +
      `and this socket drops three quarters of a volt.`,
  },
  {
    title: 'Where it came from',
    enter: (h) => {
      h.openPanel(null);
      h.setAppliance(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.goTo('plant');
    },
    text: () => `A gas turbine, and behind it a boiler making steam from its ` +
      `exhaust. Stream widths are energy. The one into the condenser is ` +
      `${term('heat-rate', 'thermal efficiency')}, drawn.`,
  },
  {
    title: 'Inside the machine',
    enter: (h) => { h.openPanel(null); h.goTo('machine'); },
    text: () => `One generator in cross-section, rotor drawn at the ` +
      `${term('load-angle', 'load angle')} it is running at. Beside it, every ` +
      `output it can hold: the ${term('capability-curve', 'capability curve')}.`,
  },
  {
    title: 'A fault, and what clears it',
    enter: (h) => {
      h.openPanel(null);
      h.setMotor('off', 'across-the-line', 'industrial');
      h.goTo('feeder');
      h.setFault('FDR_L3B', 'single-line-to-ground');
    },
    text: () => `One phase touching earth on Cherry Lane. The curves show ` +
      `which device gets there first. The lateral fuse clears it and nobody ` +
      `else notices: ${term('coordination', 'coordination')}.`,
  },
  {
    title: 'How often the lights go out',
    enter: (h) => {
      h.setFault(null, 'single-line-to-ground');
      h.goTo('feeder');
      h.openPanel('reliability');
    },
    text: () => `${term('saifi', 'SAIFI')} and ${term('saidi', 'SAIDI')} are ` +
      `not weather. They follow from how much wire is in the air and where the ` +
      `switches are. Move the three and watch what gets worse.`,
  },
  {
    title: 'How any of this was worked out',
    enter: (h) => {
      h.setFault(null, 'single-line-to-ground');
      h.setMotor('off', 'across-the-line', 'industrial');
      h.goTo('system');
      h.openPanel('solver');
    },
    text: () => `There is no formula for a power flow: only a guess and a way ` +
      `to improve it. The plot is that error shrinking. Where it jumps, a ` +
      `machine ran out of reactive capability.`,
  },
  {
    title: 'What this leaves out',
    enter: (h) => { h.goTo('system'); h.openPanel('honesty'); },
    text: () => `Everything this model does not represent, always available ` +
      `from the button below. Knowing where a model stops is most of knowing ` +
      `how to read one.`,
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
