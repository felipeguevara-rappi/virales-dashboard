/**
 * Snowflake SDK connection module.
 *
 * Implements a singleton connection pattern: a single Snowflake connection is
 * established on first use and reused for all subsequent queries within the
 * server process lifetime. If the connection drops, it is automatically reset
 * on the next query attempt.
 *
 * Authentication uses EXTERNALBROWSER (SSO) with credential caching enabled.
 */
import snowflake from 'snowflake-sdk';

snowflake.configure({ logLevel: 'ERROR' });

function getConfig() {
  return {
    account: process.env.SNOWFLAKE_ACCOUNT || '',
    username: process.env.SNOWFLAKE_USER || '',
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'RP_PERSONALUSER_WH',
    database: process.env.SNOWFLAKE_DATABASE || 'RP_SILVER_DB_PROD',
    schema: process.env.SNOWFLAKE_SCHEMA || 'TURBO_CORE',
    role: process.env.SNOWFLAKE_ROLE || '',
    authenticator: 'EXTERNALBROWSER' as const,
  };
}

// Singleton connection — established once per server process, reused for all queries
let connectionPromise: Promise<ReturnType<typeof snowflake.createConnection>> | null = null;

/**
 * Returns a singleton Snowflake connection, creating one if it doesn't exist.
 * On connection failure, the promise is cleared to allow retry on next call.
 */
function getConnection(): Promise<ReturnType<typeof snowflake.createConnection>> {
  if (connectionPromise) return connectionPromise;

  const config = getConfig();

  if (!config.account || !config.username) {
    return Promise.reject(
      new Error('Snowflake credentials not configured. Set SNOWFLAKE_ACCOUNT and SNOWFLAKE_USER in .env.local')
    );
  }

  connectionPromise = new Promise((resolve, reject) => {
    const conn = snowflake.createConnection({
      account: config.account,
      username: config.username,
      warehouse: config.warehouse,
      database: config.database,
      schema: config.schema,
      role: config.role,
      authenticator: config.authenticator,
      clientStoreTemporaryCredential: true,
    });

    conn.connect((err) => {
      if (err) {
        connectionPromise = null; // allow retry on next call
        reject(new Error(`Snowflake connection failed: ${err.message}`));
        return;
      }
      resolve(conn);
    });
  });

  return connectionPromise;
}

/**
 * Executes a SQL query against Snowflake and returns typed results.
 *
 * @param sql - The SQL statement to execute (supports bind placeholders with `?`)
 * @param binds - Optional array of bind parameter values
 * @param timeout - Query timeout in milliseconds (default: 60000ms / 1 minute)
 * @returns Promise resolving to an array of row objects typed as T
 *
 * @example
 * ```ts
 * const rows = await executeQuery<{ CITY: string; COUNT: number }>(
 *   'SELECT CITY, COUNT(*) AS COUNT FROM warehouses WHERE COUNTRY = ? GROUP BY CITY',
 *   ['MX'],
 *   30000
 * );
 * ```
 */
export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  binds: (string | number)[] = [],
  timeout: number = 60000
): Promise<T[]> {
  const conn = await getConnection();

  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      binds: binds as snowflake.Binds,
      streamResult: false,
      complete: (err, _stmt, rows) => {
        if (err) {
          // If connection died, reset for next attempt
          if (err.message?.includes('not connected') || err.message?.includes('terminated')) {
            connectionPromise = null;
          }
          reject(new Error(`Query execution failed: ${err.message}`));
          return;
        }
        resolve((rows || []) as T[]);
      },
    });

    // Enforce query timeout
    setTimeout(() => {
      reject(new Error(`Query timed out after ${timeout}ms`));
    }, timeout);
  });
}
