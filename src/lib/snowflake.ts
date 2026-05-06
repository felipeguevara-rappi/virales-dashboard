import snowflake from 'snowflake-sdk';

let connectionPool: snowflake.Connection | null = null;
let sessionReady = false;

function getConnection(): Promise<snowflake.Connection> {
  if (connectionPool && connectionPool.isUp()) {
    return Promise.resolve(connectionPool);
  }

  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT || '',
      username: process.env.SNOWFLAKE_USER || '',
      authenticator: 'EXTERNALBROWSER',
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
      database: process.env.SNOWFLAKE_DATABASE || 'RP_SILVER_DB_PROD',
      schema: process.env.SNOWFLAKE_SCHEMA || 'TURBO_CORE',
      role: process.env.SNOWFLAKE_ROLE || '',
    });

    connection.connect((err, conn) => {
      if (err) {
        console.error('Snowflake connection error:', err.message);
        reject(err);
      } else {
        connectionPool = conn;
        sessionReady = false;
        resolve(conn);
      }
    });
  });
}

function runStatement(connection: snowflake.Connection, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve((rows || []) as Record<string, unknown>[]);
        }
      },
    });
  });
}

export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  binds: (string | number)[] = []
): Promise<T[]> {
  const connection = await getConnection();

  // Set warehouse after connect (connection-level role/db/schema should already be set)
  if (!sessionReady) {
    try {
      const wh = process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH';
      await runStatement(connection, `USE WAREHOUSE "${wh}"`);
      const ctx = await runStatement(connection, `SELECT CURRENT_ROLE() AS R, CURRENT_DATABASE() AS D, CURRENT_SCHEMA() AS S, CURRENT_WAREHOUSE() AS W`);
      console.log('Snowflake session context:', JSON.stringify(ctx[0]));
    } catch (initErr) {
      console.error('Error setting warehouse:', initErr);
    }
    sessionReady = true;
  }

  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      binds: binds as snowflake.Binds,
      complete: (err, _stmt, rows) => {
        if (err) {
          console.error('Query error:', err.message);
          console.error('SQL (first 200):', sql.substring(0, 200));
          reject(err);
        } else {
          resolve((rows || []) as T[]);
        }
      },
    });
  });
}
