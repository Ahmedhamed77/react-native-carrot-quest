import { NitroModules } from 'react-native-nitro-modules';
import type { CarrotQuest } from './CarrotQuest.nitro';

const CarrotQuestHybridObject =
  NitroModules.createHybridObject<CarrotQuest>('CarrotQuest');

export function multiply(a: number, b: number): number {
  return CarrotQuestHybridObject.multiply(a, b);
}
