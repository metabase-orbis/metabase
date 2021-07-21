import type { Column } from 'metabase-types/types/Dataset';

export const isGeomColumn = (column: Column) => column.name === 'geom';
export const isNotGeomColumn = (column: Column) => !isGeomColumn(column);