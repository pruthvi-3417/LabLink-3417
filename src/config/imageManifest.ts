import type { Equipment, EquipmentCategory } from '../types/models';

export type ImageSlotKey =
  | 'campus/hero-aerial'
  | 'campus/dusk-wide'
  | 'auth/lab-interior'
  | 'departments/aiml'
  | 'departments/cse'
  | 'departments/ece'
  | 'departments/mech'
  | 'departments/robotics'
  | 'equipment/gpu-workstation'
  | 'equipment/jetson'
  | 'equipment/robotics-platform'
  | 'equipment/arduino'
  | 'equipment/raspberry-pi'
  | 'equipment/esp32-iot'
  | 'equipment/3d-printer'
  | 'equipment/oscilloscope'
  | 'equipment/fpga'
  | 'equipment/lidar'
  | 'equipment/networking'
  | 'equipment/research-instrument'
  | 'equipment/cnc'
  | 'equipment/cad-workstation';

export interface ImageManifestEntry {
  slot: ImageSlotKey;
  src: string | null;
  hasDedicatedFile: boolean;
  alt: string;
  focalPoint: string;
  dominantColor: string;
  fallbackCategory?: EquipmentCategory;
  fallbackDepartmentId?: string;
}

export const IMAGE_MANIFEST: Record<ImageSlotKey, ImageManifestEntry> = {
  'campus/hero-aerial': {
    slot: 'campus/hero-aerial',
    src: '/images/campus/hero-aerial.jpg',
    hasDedicatedFile: true,
    alt: 'Aerial view of the LabLink Nexus five-building university research campus at blue hour',
    focalPoint: '50% 45%',
    dominantColor: '#0B1528',
  },
  'campus/dusk-wide': {
    slot: 'campus/dusk-wide',
    src: '/images/campus/dusk-wide.jpg',
    hasDedicatedFile: true,
    alt: 'University engineering courtyard with illuminated glass research pavilions at dusk',
    focalPoint: '50% 52%',
    dominantColor: '#0A1324',
  },
  'auth/lab-interior': {
    slot: 'auth/lab-interior',
    src: '/images/auth/lab-interior.jpg',
    hasDedicatedFile: true,
    alt: 'Modern university research laboratory interior with compute racks and precision workbenches',
    focalPoint: '50% 50%',
    dominantColor: '#0B1220',
  },
  'departments/aiml': {
    slot: 'departments/aiml',
    src: null,
    hasDedicatedFile: false,
    alt: 'AI & Machine Learning Turing Center GPU training bay',
    focalPoint: '50% 50%',
    dominantColor: '#0B152A',
    fallbackDepartmentId: 'dept-aiml',
  },
  'departments/cse': {
    slot: 'departments/cse',
    src: '/images/departments/cse.jpg',
    hasDedicatedFile: true,
    alt: 'Computer Science & Engineering dual-monitor workstations and high-density server racks',
    focalPoint: '50% 45%',
    dominantColor: '#0D142B',
    fallbackDepartmentId: 'dept-cse',
  },
  'departments/ece': {
    slot: 'departments/ece',
    src: null,
    hasDedicatedFile: false,
    alt: 'Electronics & Communication Maxwell Hall instrumentation benches',
    focalPoint: '50% 50%',
    dominantColor: '#081B29',
    fallbackDepartmentId: 'dept-ece',
  },
  'departments/mech': {
    slot: 'departments/mech',
    src: null,
    hasDedicatedFile: false,
    alt: 'Mechanical Engineering Watt Pavilion fabrication and CNC floor',
    focalPoint: '50% 50%',
    dominantColor: '#1E1410',
    fallbackDepartmentId: 'dept-mech',
  },
  'departments/robotics': {
    slot: 'departments/robotics',
    src: '/images/departments/robotics.jpg',
    hasDedicatedFile: true,
    alt: 'Robotics & Automation Asimov Block hangar with collaborative arm cell and mobile rover grid',
    focalPoint: '50% 50%',
    dominantColor: '#14122D',
    fallbackDepartmentId: 'dept-robo',
  },
  'equipment/gpu-workstation': {
    slot: 'equipment/gpu-workstation',
    src: '/images/equipment/gpu-workstation.jpg',
    hasDedicatedFile: true,
    alt: 'Dual-GPU deep learning compute workstation in laboratory bay',
    focalPoint: '50% 50%',
    dominantColor: '#0D182F',
    fallbackCategory: 'GPU Workstation',
  },
  'equipment/jetson': {
    slot: 'equipment/jetson',
    src: null,
    hasDedicatedFile: false,
    alt: 'NVIDIA Jetson AGX Orin edge AI developer module',
    focalPoint: '50% 50%',
    dominantColor: '#0E192D',
    fallbackCategory: 'Embedded & IoT',
  },
  'equipment/robotics-platform': {
    slot: 'equipment/robotics-platform',
    src: '/images/equipment/robotics-platform.jpg',
    hasDedicatedFile: true,
    alt: '6-axis collaborative robotic manipulator arm on optical table',
    focalPoint: '50% 45%',
    dominantColor: '#131730',
    fallbackCategory: 'Robotics',
  },
  'equipment/arduino': {
    slot: 'equipment/arduino',
    src: null,
    hasDedicatedFile: false,
    alt: 'Arduino Mega 2560 microcontroller sensor prototyping kit',
    focalPoint: '50% 50%',
    dominantColor: '#0A1C2A',
    fallbackCategory: 'Embedded & IoT',
  },
  'equipment/raspberry-pi': {
    slot: 'equipment/raspberry-pi',
    src: null,
    hasDedicatedFile: false,
    alt: 'Raspberry Pi 5 edge compute node cluster',
    focalPoint: '50% 50%',
    dominantColor: '#0E1A2D',
    fallbackCategory: 'Embedded & IoT',
  },
  'equipment/esp32-iot': {
    slot: 'equipment/esp32-iot',
    src: '/images/equipment/esp32-iot.jpg',
    hasDedicatedFile: true,
    alt: 'ESP32 LoRaWAN wireless IoT sensor and PCB test bench',
    focalPoint: '50% 50%',
    dominantColor: '#0A1F2B',
    fallbackCategory: 'Embedded & IoT',
  },
  'equipment/3d-printer': {
    slot: 'equipment/3d-printer',
    src: '/images/equipment/3d-printer.jpg',
    hasDedicatedFile: true,
    alt: 'Enclosed high-speed CoreXY 3D printer during precision fabrication',
    focalPoint: '50% 48%',
    dominantColor: '#101D2A',
    fallbackCategory: '3D Printing',
  },
  'equipment/oscilloscope': {
    slot: 'equipment/oscilloscope',
    src: '/images/equipment/oscilloscope.jpg',
    hasDedicatedFile: true,
    alt: 'High-bandwidth mixed-signal digital oscilloscope showing waveform traces',
    focalPoint: '50% 50%',
    dominantColor: '#0A192B',
    fallbackCategory: 'Electronics & Test',
  },
  'equipment/fpga': {
    slot: 'equipment/fpga',
    src: null,
    hasDedicatedFile: false,
    alt: 'Xilinx Zynq UltraScale+ FPGA hardware acceleration board',
    focalPoint: '50% 50%',
    dominantColor: '#0B1D2C',
    fallbackCategory: 'FPGA & Hardware',
  },
  'equipment/lidar': {
    slot: 'equipment/lidar',
    src: null,
    hasDedicatedFile: false,
    alt: '32-channel spinning 3D LiDAR spatial scanner',
    focalPoint: '50% 50%',
    dominantColor: '#12172C',
    fallbackCategory: 'Robotics',
  },
  'equipment/networking': {
    slot: 'equipment/networking',
    src: null,
    hasDedicatedFile: false,
    alt: 'Programmable SDN switch and software-defined radio testbed',
    focalPoint: '50% 50%',
    dominantColor: '#0E162B',
    fallbackCategory: 'Networking',
  },
  'equipment/research-instrument': {
    slot: 'equipment/research-instrument',
    src: null,
    hasDedicatedFile: false,
    alt: 'Precision laboratory research measurement instrument',
    focalPoint: '50% 50%',
    dominantColor: '#0C1A28',
    fallbackCategory: 'Research Instrument',
  },
  'equipment/cnc': {
    slot: 'equipment/cnc',
    src: null,
    hasDedicatedFile: false,
    alt: '5-axis desktop CNC precision machining center',
    focalPoint: '50% 50%',
    dominantColor: '#1A1512',
    fallbackCategory: '3D Printing',
  },
  'equipment/cad-workstation': {
    slot: 'equipment/cad-workstation',
    src: null,
    hasDedicatedFile: false,
    alt: 'High-memory CAD & finite-element simulation workstation',
    focalPoint: '50% 50%',
    dominantColor: '#111829',
    fallbackCategory: 'GPU Workstation',
  },
};

export const MISSING_IMAGE_SLOTS: ImageSlotKey[] = (
  Object.values(IMAGE_MANIFEST) as ImageManifestEntry[]
)
  .filter((entry) => !entry.hasDedicatedFile)
  .map((entry) => entry.slot);

export function resolveManifestSlotForEquipment(
  equipment: Pick<Equipment, 'id' | 'equipmentId' | 'name' | 'category'>
): ImageSlotKey {
  const hay = `${equipment.id} ${equipment.equipmentId} ${equipment.name}`.toLowerCase();
  if (hay.includes('jetson')) return 'equipment/jetson';
  if (hay.includes('arduino')) return 'equipment/arduino';
  if (hay.includes('raspberry') || hay.includes('rpi')) return 'equipment/raspberry-pi';
  if (hay.includes('esp32') || hay.includes('stm32') || hay.includes('lora')) return 'equipment/esp32-iot';
  if (hay.includes('lidar')) return 'equipment/lidar';
  if (hay.includes('cnc')) return 'equipment/cnc';
  if (hay.includes('cad')) return 'equipment/cad-workstation';
  if (hay.includes('fpga') || equipment.category === 'FPGA & Hardware') return 'equipment/fpga';
  if (hay.includes('gpu') || hay.includes('dgx') || equipment.category === 'GPU Workstation') {
    return 'equipment/gpu-workstation';
  }
  if (equipment.category === 'Robotics') return 'equipment/robotics-platform';
  if (equipment.category === '3D Printing') return 'equipment/3d-printer';
  if (equipment.category === 'Electronics & Test') return 'equipment/oscilloscope';
  if (equipment.category === 'Networking') return 'equipment/networking';
  if (equipment.category === 'Research Instrument') return 'equipment/research-instrument';
  return 'equipment/esp32-iot';
}
