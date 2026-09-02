import { jakaZuPlugin } from '../jaka-zu-series';

/** JAKA Zu 20. Ориентировочный вылет 2.10 м — посчитан по смещениям суставов в URDF. */
export const jakaZu20 = jakaZuPlugin({
  id: 'jaka-zu20',
  displayNameKey: 'robots.jakaZu20.name',
  tableSize: [2.8, 2.0],
});
