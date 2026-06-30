/**
 * Toolbox Manager
 *
 * Manages Google MCP Toolbox instances as child processes.
 *
 * ADG spawns one Toolbox process per database source (or one shared
 * instance for all sources). The Toolbox runs as an MCP stdio server,
 * and ADG communicates with it via the MCP client SDK.
 *
 * Architecture:
 *   Agent → ADG Governance Proxy → MCP Toolbox → Database
 *
 * ADG handles: credential vault, governance policies, audit logging.
 * Toolbox handles: connection pooling, query execution, prebuilt tools.
 */

import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateToolboxConfig, serializeToolboxYaml } from './config.js';
import type { Config } from '../config/types.js';

export interface ToolboxInstance {
  id: string;
  process: ChildProcess;
  configPath: string;
  sourceNames: string[];
  startedAt: Date;
}

export interface ToolboxManagerOptions {
  /** Path to the `toolbox` binary (defaults to npx @toolbox-sdk/server) */
  toolboxCommand?: string;
  /** Environment variables to pass to Toolbox processes */
  env?: Record<string, string>;
}

export class ToolboxManager {
  private instances: Map<string, ToolboxInstance> = new Map();
  private options: Required<ToolboxManagerOptions>;
  private tempDir: string;

  constructor(options: ToolboxManagerOptions = {}) {
    this.options = {
      toolboxCommand: options.toolboxCommand || 'npx',
      env: options.env || {},
    };
    this.tempDir = mkdtempSync(join(tmpdir(), 'adg-toolbox-'));
  }

  /**
   * Start a Toolbox instance for the given configuration.
   * Generates a tools.yaml from the ADG config, then spawns
   * the Toolbox process with that config.
   */
  async start(config: Config): Promise<ToolboxInstance> {
    const instanceId = randomUUID();
    const toolboxConfig = generateToolboxConfig(config);

    if (toolboxConfig.sources.length === 0) {
      // No database sources — return a dummy instance
      const dummy: ToolboxInstance = {
        id: instanceId,
        process: null as unknown as ChildProcess,
        configPath: '',
        sourceNames: [],
        startedAt: new Date(),
      };
      this.instances.set(instanceId, dummy);
      return dummy;
    }

    // Write tools.yaml
    const configDir = join(this.tempDir, instanceId);
    const { mkdirSync } = await import('fs');
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, 'tools.yaml');
    const yamlContent = serializeToolboxYaml(toolboxConfig);
    writeFileSync(configPath, yamlContent, 'utf-8');

    const sourceNames = toolboxConfig.sources.map((s) => s.name);

    // Build args for Toolbox CLI
    const args = [
      '-y',
      '@toolbox-sdk/server',
      '--config', configPath,
      '--stdio',
    ];

    // Merge environment
    const env = {
      ...process.env,
      ...this.options.env,
    };

    const proc = spawn(this.options.toolboxCommand, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    const instance: ToolboxInstance = {
      id: instanceId,
      process: proc,
      configPath,
      sourceNames,
      startedAt: new Date(),
    };

    // Log stderr for debugging
    proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error(`[toolbox:${instanceId}] ${msg}`);
      }
    });

    proc.on('error', (err) => {
      console.error(`[toolbox:${instanceId}] process error:`, err.message);
    });

    proc.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(
          `[toolbox:${instanceId}] exited with code ${code}, signal ${signal}`
        );
      }
      this.instances.delete(instanceId);
      // Clean up temp config
      try { unlinkSync(configPath); } catch { /* ignore */ }
    });

    this.instances.set(instanceId, instance);
    return instance;
  }

  /**
   * Get a running Toolbox instance by ID.
   */
  get(instanceId: string): ToolboxInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Stop a Toolbox instance gracefully.
   */
  async stop(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    if (instance.process?.pid) {
      instance.process.kill('SIGTERM');
      // Force kill after 5s
      setTimeout(() => {
        try { instance.process?.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);
    }

    this.instances.delete(instanceId);
    try { unlinkSync(instance.configPath); } catch { /* ignore */ }
  }

  /**
   * Stop all running Toolbox instances.
   */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.instances.keys());
    await Promise.all(ids.map((id) => this.stop(id)));
  }

  /**
   * Check if any Toolbox instances are running.
   */
  get runningCount(): number {
    return this.instances.size;
  }

  /**
   * Clean up temp directory.
   */
  async cleanup(): Promise<void> {
    await this.stopAll();
    const { rmSync } = await import('fs');
    try { rmSync(this.tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
