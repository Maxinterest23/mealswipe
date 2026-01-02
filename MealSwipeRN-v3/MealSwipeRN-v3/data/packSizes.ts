export interface PackSizeHint {
  packSize: number;
  packPrice: number;
  unit: string;
  label?: string;
}

export const packSizeHints: Record<string, PackSizeHint> = {
  spaghetti: { packSize: 500, packPrice: 0.85, unit: 'g', label: '500g pack' },
  pancetta: { packSize: 200, packPrice: 2.50, unit: 'g', label: '200g pack' },
  eggs: { packSize: 6, packPrice: 2.40, unit: 'piece', label: '6-pack' },
  parmesan: { packSize: 200, packPrice: 3.50, unit: 'g', label: '200g wedge' },
  chicken: { packSize: 500, packPrice: 5.50, unit: 'g', label: '500g pack' },
  curry: { packSize: 1, packPrice: 1.50, unit: 'tbsp', label: 'jar' },
  'curry paste': { packSize: 1, packPrice: 1.50, unit: 'tbsp', label: 'jar' },
  'coconut milk': { packSize: 400, packPrice: 1.00, unit: 'ml', label: '400ml can' },
  rice: { packSize: 1000, packPrice: 1.80, unit: 'g', label: '1kg bag' },
  chickpeas: { packSize: 400, packPrice: 0.65, unit: 'g', label: '400g can' },
  noodles: { packSize: 300, packPrice: 1.20, unit: 'g', label: '300g pack' },
  beef: { packSize: 500, packPrice: 8.00, unit: 'g', label: '500g pack' },
  'soy sauce': { packSize: 1, packPrice: 0.32, unit: 'tbsp', label: 'bottle' },
  broccoli: { packSize: 200, packPrice: 0.99, unit: 'g', label: '200g bag' },
  garlic: { packSize: 1, packPrice: 0.18, unit: 'clove', label: 'bulb' },
  basil: { packSize: 20, packPrice: 0.90, unit: 'g', label: '20g bunch' },
};
