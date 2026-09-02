import { jakaZuPlugin } from '../jaka-zu-series';

/** JAKA Zu 5. Ориентировочный вылет 1.14 м — посчитан по смещениям суставов в URDF. */
export const jakaZu5 = jakaZuPlugin({
  id: 'jaka-zu5',
  displayNameKey: 'robots.jakaZu5.name',
  tableSize: [1.6, 1.2],
});
