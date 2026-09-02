import { jakaZuPlugin } from '../jaka-zu-series';

/** JAKA Zu 12. Ориентировочный вылет 1.53 м — посчитан по смещениям суставов в URDF. */
export const jakaZu12 = jakaZuPlugin({
  id: 'jaka-zu12',
  displayNameKey: 'robots.jakaZu12.name',
  tableSize: [2.0, 1.5],
});
