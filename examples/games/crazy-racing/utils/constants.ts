export type CupId = '50cc' | '100cc' | '150cc'
export type WheelType = 'classic' | 'offroad' | 'sport'
export type CarModel = 'kart' | 'buggy' | 'racer'
export type WorldId = 0 | 1

export interface CupProfile {
  id: CupId
  label: string
  maxSpeed: number
  accel: number
  aiSpeedMul: number
}

export const CUPS: CupProfile[] = [
  { id: '50cc',  label: '50cc',  maxSpeed: 16, accel: 9,  aiSpeedMul: 0.85 },
  { id: '100cc', label: '100cc', maxSpeed: 24, accel: 13, aiSpeedMul: 0.92 },
  { id: '150cc', label: '150cc', maxSpeed: 32, accel: 18, aiSpeedMul: 1.00 },
]

export interface WorldProfile {
  id: WorldId
  name: string
  groundColor: number
  skyColor: number
  fenceColor: number
  trackColor: number
}

export const WORLDS: WorldProfile[] = [
  { id: 0, name: 'Mundo Verde',  groundColor: 0x4f9b3c, skyColor: 0x9adcff, fenceColor: 0xffffff, trackColor: 0x2d2d2d },
  { id: 1, name: 'Mundo Deserto', groundColor: 0xd9b56b, skyColor: 0xf7c98a, fenceColor: 0xc25b2c, trackColor: 0x3b2a20 },
]

export const PHASES_PER_WORLD = 5
export const LAPS_PER_RACE = 3
export const AI_OPPONENTS = 4

export const CAR_COLORS: number[] = [
  0xff3b30, 0xffcc00, 0x34c759, 0x007aff,
  0xaf52de, 0xff9500, 0x5ac8fa, 0xff2d92,
]

export const WHEEL_TYPES: WheelType[] = ['classic', 'offroad', 'sport']
export const WHEEL_SIZES: number[] = [0.8, 1.0, 1.25, 1.5]
export const CAR_MODELS: CarModel[] = ['kart', 'buggy', 'racer']

export interface PlayerCustomization {
  carModel: CarModel
  color: number
  wheelType: WheelType
  wheelSize: number
}

export const DEFAULT_CUSTOMIZATION: PlayerCustomization = {
  carModel: 'kart',
  color: CAR_COLORS[0],
  wheelType: 'classic',
  wheelSize: 1.0,
}
