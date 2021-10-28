import type { Column } from 'metabase-types/types/Dataset';

export const isGeomColumn = (column: Column) => column.name === 'geom';
export const isNotGeomColumn = (column: Column) => !isGeomColumn(column);
export const isIdColumn = (column: Column) => column.name === 'orbis_id' || column.name === 'id';