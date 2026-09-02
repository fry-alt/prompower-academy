import { jakaZuPlugin } from '../jaka-zu-series';

/** JAKA Zu 7. Ориентировочный вылет 1.00 м — посчитан по смещениям суставов в URDF. */
export const jakaZu7 = jakaZuPlugin({
  id: 'jaka-zu7',
  displayNameKey: 'robots.jakaZu7.name',
  tableSize: [1.4, 1.0],
});
