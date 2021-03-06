import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';
import { 
  createConnection, Connection, ConnectionOptions, 
  ObjectType, EntitySchema, Repository, BaseEntity,
} from 'typeorm';
import { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { SqliteConnectionOptions } from 'typeorm/driver/sqlite/SqliteConnectionOptions';
import { Logger, DatabaseOptions, Database } from 'ts-framework-common';

export interface EntityDatabaseOptions extends DatabaseOptions {
  logger?: Logger;
  connection?: Connection;
  connectionOpts?: ConnectionOptions;
  customQueriesDir?: string;
  entities: any[];
}

export class EntityDatabase implements Database {
  protected logger: Logger;
  protected connection: Connection;
  protected entities: BaseEntity[] = [];
  protected connectionOptions: ConnectionOptions;
  protected readonly customQueries: Map<string, string> = new Map();

  /**
   * Creates a new Entity database for SQL drivers.
   * 
   * @param connection The TypeORM connection to the database
   */
  constructor(protected options: EntityDatabaseOptions) {
    this.logger = options.logger || new Logger();

    // TODO: Handle connection url
    this.connection = options.connection;
    this.connectionOptions = options.connection ? options.connection.options : options.connectionOpts;

    // Log entities initialization
    if (this.logger && this.connectionOptions && this.connectionOptions.entities) {
      this.connectionOptions.entities.map((Entity: any) => {
        if (Entity && Entity.prototype && Entity.prototype.constructor) {
          this.entities.push(Entity);
          this.logger.silly(`Registering model in database: ${Entity.prototype.constructor.name}`);
        } else {
          this.logger.warn(`Invalid model registered in database: ${Entity}`, Entity);
        }
      });
    }
    if (options.customQueriesDir) {
      this.loadCustomQueries();
    }
  }

  /**
   * Connects to the database, creating a connection instance if not available.
   * 
   * @returns A promise to the connection instance.
   */
  public async connect(): Promise<EntityDatabaseOptions> {
    const { type, host, port, username, database, synchronize } = this.connectionOptions as any;

    if (this.logger) {
      this.logger.debug('Connecting to the database', { type, host, port, username, database, synchronize });
    }

    if (this.connectionOptions) {
      this.connection = await createConnection(this.connectionOptions);
    }
    
    if (this.logger) {
      this.logger.silly(`Successfully connected to the database`, { database });
    }
    return this.options;
  }

  /**
   * Gets the database current state.
   */
  public isReady(): boolean {
    return this.connection && this.connection.isConnected;
  }

  /**
   * Describe database status and entities.
   */
  public describe() {
    return {
      isReady: this.isReady(),
      entities: this.entities,
    };
  }

  /**
   * Disconnects from existing connection, if any.
   */
  public async disconnect(): Promise<void> {
    const { type, host, port, username, database, synchronize } = this.connectionOptions as any;

    if (this.connection) {
      if (this.logger) {
        // TODO: Hide authentication information
        this.logger.debug('Disconnecting from database', { host, port, username, database });
      }
      await this.connection.close();
    }
  }

  /**
   * Gets a single repository from connection manager.
   * 
   * @param target The target class or table name
   */
  public getRepository<Entity>(target: ObjectType<Entity> | EntitySchema<Entity> | string): Repository<Entity> {
    return this.connection.manager.getRepository(target as any) as any;
  }

  /**
   * Executes a pre loaded query from the queries directory
   * The query name is relative to the customQueriesDir, so if you saved in
   * `queries/user/list.sql` then, the identifier will `be user/list`
   * @param name The identifier of the query to be executed
   * @param params Any params if needed to add to the query
   */
  public async executeCustomQuery<T>(name: string, params: any[] = []): Promise<any | T> {
    const query = this.customQueries.get(name);
    return this.connection.query(query, params) as T | any;
  }

  /**
   * Loads all custom queries from the customQueriesDir path
   */
  private loadCustomQueries(): void {
    glob(path.join(this.options.customQueriesDir, './**/*.sql'), (err, matches) => {
      if (err) {
        // Do something
      }
      matches.forEach(filePath => this.loadCustomQuery(filePath));
    });
  }

  /**
   * Loads a customQuery to the memory
   * @param filePath The file path to be loaded in memory
   */
  private loadCustomQuery(filePath: string) {
    const location = path.relative(this.options.customQueriesDir, filePath);
    const name = location.slice(0, location.lastIndexOf('.'));
    const query = fs.readFileSync(filePath).toString();
    this.customQueries.set(name, query);
  }
}
