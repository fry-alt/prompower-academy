import { jakaZuPlugin } from '../jaka-zu-series';

/** JAKA Zu 15. Ориентировочный вылет 1.73 м — посчитан по смещениям суставов в URDF. */
export const jakaZu15 = jakaZuPlugin({
  id: 'jaka-zu15',
  displayNameKey: 'robots.jakaZu15.name',
  tableSize: [2.3, 1.7],
});
