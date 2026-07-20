export type CameraMode = "director" | "follow" | "trackside" | "helicopter" | "orbit";

export type DirectorShotKind = "follow" | "trackside" | "helicopter";

export type ReplayShotKind = DirectorShotKind | "orbit";

export type ReplayCarState = {
  code: string;
  brake: number;
  drs: number;
  position: number;
  interval: number;
  arcDistance: number;
};

export type ReplayDirectorInput = {
  mode: CameraMode;
  now: number;
  isPlaying: boolean;
  reducedMotion: boolean;
  seekToken: string | number | null;
  yellow: boolean;
  safetyCarActive: boolean;
  focus: ReplayCarState;
  states: ReplayCarState[];
};

export type DirectorState = {
  targetCodes: string[];
  shotKind: ReplayShotKind;
  reason: string;
  changedAt: number;
  holdUntil: number;
  seekToken: string | number | null;
};

export type DirectorShot = DirectorState;

export function createDirectorState(now = 0): DirectorState {
  return {
    targetCodes: [],
    shotKind: "helicopter",
    reason: "initial",
    changedAt: now,
    holdUntil: now,
    seekToken: null,
  };
}

function sameShot(state: DirectorState, shotKind: ReplayShotKind, targetCodes: string[]) {
  return state.shotKind === shotKind
    && state.targetCodes.length === targetCodes.length
    && state.targetCodes.every((code, index) => code === targetCodes[index]);
}

function chooseBattle(input: ReplayDirectorInput) {
  const cars = [...input.states.filter((state) => state.code !== input.focus.code), input.focus]
    .sort((left, right) => left.position - right.position);
  const focusIndex = cars.findIndex((state) => state.code === input.focus.code);

  for (const neighborIndex of [focusIndex - 1, focusIndex + 1]) {
    const neighbor = cars[neighborIndex];
    if (!neighbor || Math.abs(neighbor.position - input.focus.position) !== 1) continue;
    const trailing = neighbor.position > input.focus.position ? neighbor : input.focus;
    if (Number.isFinite(trailing.interval) && Math.abs(trailing.interval) < 1.2) {
      return neighbor.code;
    }
  }

  return null;
}

function activate(
  state: DirectorState,
  input: ReplayDirectorInput,
  shotKind: ReplayShotKind,
  targetCodes: string[],
  reason: string,
  holdFor: number,
): DirectorShot {
  if (
    sameShot(state, shotKind, targetCodes)
    && state.reason === reason
    && (reason !== "seek" || state.seekToken === input.seekToken)
  ) {
    return { ...state, seekToken: input.seekToken };
  }

  return {
    targetCodes,
    shotKind,
    reason,
    changedAt: input.now,
    holdUntil: input.now + holdFor,
    seekToken: input.seekToken,
  };
}

export function selectDirectorShot(
  input: ReplayDirectorInput,
  state: DirectorState = createDirectorState(input.now),
): DirectorShot {
  if (input.mode !== "director") {
    return {
      targetCodes: [input.focus.code],
      shotKind: input.mode,
      reason: `manual-${input.mode}`,
      changedAt: input.now,
      holdUntil: input.now,
      seekToken: input.seekToken,
    };
  }

  if (input.reducedMotion) {
    if (sameShot(state, "helicopter", [input.focus.code]) && state.reason === "reduced-motion") {
      return { ...state, seekToken: input.seekToken };
    }

    return {
      targetCodes: [input.focus.code],
      shotKind: "helicopter",
      reason: "reduced-motion",
      changedAt: input.now,
      holdUntil: Number.POSITIVE_INFINITY,
      seekToken: input.seekToken,
    };
  }

  if (input.yellow || input.safetyCarActive) {
    return activate(
      state,
      input,
      "helicopter",
      [input.focus.code],
      input.safetyCarActive ? "safety-car" : "yellow",
      8000,
    );
  }

  const seeking = state.targetCodes.length > 0 && state.seekToken !== input.seekToken;
  if (seeking) {
    return activate(state, input, "helicopter", [input.focus.code], "seek", 1250);
  }

  if (!input.isPlaying) {
    if (state.reason === "seek" && state.holdUntil > input.now) {
      return state;
    }
    return activate(state, input, "helicopter", [input.focus.code], "paused", 1250);
  }

  if (state.reason !== "reduced-motion" && state.holdUntil > input.now) {
    return { ...state, seekToken: input.seekToken };
  }

  const battleCode = chooseBattle(input);
  if (battleCode) {
    return activate(state, input, "trackside", [input.focus.code, battleCode], "battle", 5000);
  }

  if (input.focus.brake > 30) {
    return activate(state, input, "trackside", [input.focus.code], "braking", 5000);
  }

  if (input.focus.drs >= 10) {
    return activate(state, input, "follow", [input.focus.code], "drs", 5000);
  }

  return activate(state, input, "follow", [input.focus.code], "normal", 5000);
}
