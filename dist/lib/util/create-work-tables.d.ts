import { MySQL } from 'node-mysql2-wrapper';
export default function createWorkTables(sql: MySQL, workTableName?: string, workResultTableName?: string, workChildrenTableName?: string): Promise<any>;
