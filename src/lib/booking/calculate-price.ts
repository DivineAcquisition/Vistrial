// ============================================
// DYNAMIC PRICE CALCULATOR
// Calculate price based on selections
// ============================================

import type { Service, PriceModifier } from '@/types/booking';

interface PriceCalculation {
  basePrice: number;
  adjustments: Array<{ name: string; type: string; amount: number }>;
  addOns: Array<{ name: string; amount: number }>;
  subtotal: number;
  total: number;
  priceType: 'fixed' | 'estimate' | 'quote';
}

export function calculatePrice(
  service: Service,
  selectedOptions: Record<string, string | number | boolean>,
  selectedAddOnIds: string[]
): PriceCalculation {
  if (service.priceType === 'quote') {
    return { basePrice: 0, adjustments: [], addOns: [], subtotal: 0, total: 0, priceType: 'quote' };
  }

  let runningPrice = service.basePrice;
  const adjustments: PriceCalculation['adjustments'] = [];
  const addOnsList: PriceCalculation['addOns'] = [];

  for (const variable of service.variables) {
    const selectedValue = selectedOptions[variable.id];
    if (selectedValue === undefined || selectedValue === null) continue;

    if (variable.options) {
      const selectedOption = variable.options.find(
        (opt) => opt.value === selectedValue || opt.id === selectedValue
      );

      if (selectedOption) {
        const adjustment = applyModifier(runningPrice, selectedOption.priceModifier);
        if (adjustment !== 0) {
          adjustments.push({
            name: `${variable.name}: ${selectedOption.label}`,
            type: selectedOption.priceModifier.type,
            amount: adjustment,
          });
          runningPrice += adjustment;
        }
      }
    }
  }

  const subtotal = runningPrice;

  for (const addOnId of selectedAddOnIds) {
    const addOn = service.addOns.find((a) => a.id === addOnId);
    if (addOn) {
      let addOnAmount = addOn.price;
      if (addOn.priceType === 'percentage') {
        addOnAmount = subtotal * (addOn.price / 100);
      }
      addOnsList.push({ name: addOn.name, amount: addOnAmount });
      runningPrice += addOnAmount;
    }
  }

  return {
    basePrice: service.basePrice,
    adjustments,
    addOns: addOnsList,
    subtotal,
    total: Math.round(runningPrice * 100) / 100,
    priceType: service.priceType === 'starting_at' ? 'estimate' : 'fixed',
  };
}

function applyModifier(basePrice: number, modifier: PriceModifier): number {
  switch (modifier.type) {
    case 'fixed': return modifier.value - basePrice;
    case 'add': return modifier.value;
    case 'percentage': return basePrice * (modifier.value / 100);
    case 'multiply': return basePrice * modifier.value - basePrice;
    default: return 0;
  }
}
