import { jakaZuPlugin } from '../jaka-zu-series';

/** JAKA Zu 30. Ориентировочный вылет 1.67 м — посчитан по смещениям суставов в URDF. */
export const jakaZu30 = jakaZuPlugin({
  id: 'jaka-zu30',
  displayNameKey: 'robots.jakaZu30.name',
  tableSize: [2.2, 1.6],
});
