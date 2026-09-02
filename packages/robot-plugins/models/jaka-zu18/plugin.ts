import { jakaZuPlugin } from '../jaka-zu-series';

/** JAKA Zu 18. Ориентировочный вылет 1.27 м — посчитан по смещениям суставов в URDF. */
export const jakaZu18 = jakaZuPlugin({
  id: 'jaka-zu18',
  displayNameKey: 'robots.jakaZu18.name',
  tableSize: [1.8, 1.3],
});
