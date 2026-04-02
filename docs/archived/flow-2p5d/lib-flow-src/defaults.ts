import type { FlowSimulationDefaults } from "./types";

export const FLOW_SIMULATION_DEFAULTS: FlowSimulationDefaults = {
  view: "top",
  grid: {
    width: 256,
    height: 144,
  },
  speedPresetsMps: [20, 40, 60],
  metricIds: ["wakeWidth", "wakeLength", "wakeArea", "dragProxy"],
};
