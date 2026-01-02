import { Store } from '@/types';

export const stores: Store[] = [
  {
    id: 'tesco',
    name: 'Tesco',
    primaryColor: '#0047BB',
    isOnlineEnabled: true,
    searchUrlTemplate: 'https://www.tesco.com/groceries/',
  },
  {
    id: 'sainsburys',
    name: 'Sainsbury\'s',
    primaryColor: '#F36C21',
    isOnlineEnabled: true,
    searchUrlTemplate: 'https://www.sainsburys.co.uk/shop/gb/groceries',
  },
  {
    id: 'asda',
    name: 'ASDA',
    primaryColor: '#78BE20',
    isOnlineEnabled: true,
    searchUrlTemplate: 'https://groceries.asda.com/',
  },
  {
    id: 'waitrose',
    name: 'Waitrose',
    primaryColor: '#2E7D32',
    isOnlineEnabled: true,
    searchUrlTemplate: 'https://www.waitrose.com/ecom/shop/browse/groceries',
  },
];
