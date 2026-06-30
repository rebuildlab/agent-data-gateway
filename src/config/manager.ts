/**
 * ConfigManager
 *
 * Mutable config wrapper that provides runtime configuration management.
 * Enables AI agents to add/remove data sources, manage agent access scopes,
 * and persist changes back to YAML.
 *
 * Used by the MCP admin tools to let AI agents configure the gateway
 * without manual YAML editing.
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse, stringify } from 'yaml';
import type { ZodIssue } from 'zod';
import {
  ConfigSchema,
  SourceSchema,
  ScopeSchema,
  type Config,
  type Source,
  type Scope,
} from './types.js';
import { CredentialStore } from '../credential/store.js';

export class ConfigManager {
  private config: Config;
  private configPath: string;

  private constructor(config: Config, configPath: string) {
    this.config = config;
    this.configPath = configPath;
  }

  /**
   * Load a ConfigManager from a YAML config file.
   * Validates the config against the ConfigSchema at load time.
   *
   * @param path - Path to the YAML config file
   * @throws {Error} If the file cannot be read or validation fails
   */
  static load(path: string): ConfigManager {
    const raw = readFileSync(path, 'utf-8');
    const parsed = parse(raw);
    const result = ConfigSchema.safeParse(parsed);

    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Config validation failed:\n${errors}`);
    }

    return new ConfigManager(result.data, path);
  }

  /**
   * Return a deep-cloned snapshot of the current configuration.
   * Modifying the returned object does not affect the managed config.
   */
  getConfig(): Config {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Add a new data source to the configuration.
   * Validates the source against the SourceSchema, appends it to the sources
   * array, and persists the updated config to the YAML file.
   *
   * @param source - The data source to add
   * @throws {Error} If the source fails schema validation
   */
  addSource(source: Source): void {
    const result = SourceSchema.safeParse(source);
    if (!result.success) {
      const issues = result.error.issues
        .map((i: ZodIssue) => `  ${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid source: ${issues}`);
    }
    this.config.sources.push(result.data);
    this.save();
  }

  /**
   * Remove a data source by name.
   *
   * @param name - The name of the source to remove
   * @returns true if the source was found and removed, false otherwise
   */
  removeSource(name: string): boolean {
    const idx = this.config.sources.findIndex((s) => s.name === name);
    if (idx === -1) return false;
    this.config.sources.splice(idx, 1);
    this.save();
    return true;
  }

  /**
   * Add or update an agent access scope.
   * If a scope with the same agent ID already exists, it is replaced.
   * Otherwise, a new scope is appended.
   *
   * @param scope - The agent scope to add or update
   * @throws {Error} If the scope fails schema validation
   */
  addScope(scope: Scope): void {
    const result = ScopeSchema.safeParse(scope);
    if (!result.success) {
      const issues = result.error.issues
        .map((i: ZodIssue) => `  ${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid scope: ${issues}`);
    }
    const idx = this.config.scopes.findIndex((s) => s.agent === scope.agent);
    if (idx !== -1) {
      this.config.scopes[idx] = result.data;
    } else {
      this.config.scopes.push(result.data);
    }
    this.save();
  }

  /**
   * Remove an agent scope by agent ID.
   *
   * @param agentId - The agent ID whose scope should be removed
   * @returns true if the scope was found and removed, false otherwise
   */
  removeScope(agentId: string): boolean {
    const idx = this.config.scopes.findIndex((s) => s.agent === agentId);
    if (idx === -1) return false;
    this.config.scopes.splice(idx, 1);
    this.save();
    return true;
  }

  /**
   * Persist the current config state to the YAML file.
   */
  save(): void {
    const yamlStr = stringify(this.config);
    writeFileSync(this.configPath, yamlStr, 'utf-8');
  }

  /**
   * Build a fresh CredentialStore from the current config state.
   * Used after sources are added or removed to update the credential
   * store that connectors rely on.
   */
  reloadCredentialStore(): CredentialStore {
    return CredentialStore.fromConfig(this.config);
  }
}
