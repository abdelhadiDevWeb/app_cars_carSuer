import type { IconSymbolName } from '@/components/ui/icon-symbol';

export function getWorkshopTypeIcon(type?: string): IconSymbolName {
  switch (type) {
    case 'paint_vehicle':
      return 'paintbrush.fill';
    case 'mechanic':
      return 'wrench.fill';
    case 'mechanic_paint_inspector':
      return 'gearshape.fill';
    default:
      return 'wrench.fill';
  }
}
