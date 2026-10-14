import { Vector3 } from "three";
import type { FlowRole } from "./energyFlowModel";

/** Each connection has its own architectural terminal; there is no shared outdoor hub.
 * Routes run equipment → home, except the internal home circuit (load → supply).
 * EnergyScene applies the measured sign and reverses consumption paths for EV/home.
 */
export function createEnergyRoutes(): Record<FlowRole, Vector3[]> {
  const points = (coordinates: number[][]) =>
    coordinates.map(([x, y, z]) => new Vector3(x, y, z));
  return {
    // Roof array → a dedicated inverter on the rear part of the service facade.
    solar: points([
      [1.669, 2.827, -0.66],
      [1.88, 2.68, -0.66],
      [2.025, 2.58, -0.66],
      [2.08, 2.36, -0.66],
      [2.08, 1.08, -0.66],
      [2.04, 0.85, -0.66],
      [1.91, 0.79, -0.66],
    ]),
    // Wall battery → its own short return into the lower service bay.
    battery: points([
      [2.22, 0.39, 0.99],
      [2.42, 0.27, 1.02],
      [2.47, 0.17, 1.22],
      [2.35, 0.17, 1.43],
      [2.08, 0.23, 1.43],
      [1.9, 0.36, 1.43],
    ]),
    // Mast → separate house meter. The path stays outside the battery connection.
    grid: points([
      [3.9, 2.88, 1.47],
      [3.9, 1.84, 1.5],
      [3.9, 0.3, 1.52],
      [3.7, 0.09, 1.92],
      [3.24, 0.09, 2.15],
      [2.93, 0.09, 1.89],
      [2.93, 0.09, 0.46],
      [2.71, 0.12, 0.1],
      [2.24, 0.23, 0.1],
      [1.9, 0.48, 0.1],
    ]),
    // Charging circuit enters the front-left wall; it never joins the grid lane.
    ev: points([
      [-1.91, 0.2, 2.15],
      [-1.84, 0.11, 2.38],
      [-1.59, 0.09, 2.45],
      [-1.34, 0.1, 2.28],
      [-1.33, 0.2, 1.94],
      [-1.48, 0.4, 1.62],
    ]),
    // Consumption is a quiet interior circuit, seen through the front glazing.
    home: points([
      [-0.4, 0.32, 1.16],
      [0.12, 0.32, 1.16],
      [0.8, 0.32, 1.16],
      [1.36, 0.32, 1.16],
    ]),
  };
}
