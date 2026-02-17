

export interface WatcherConfig {
  basePorts: number[];
  range: number;
  interval: number;
  strategy: 'chain' | 'kill-base';
  filter: string[];
  dryRun: boolean;
  cwd?: string;
}

export interface ProcessInfo {
  pid: number;
  command: string;
  cwd?: string;
}

export type PortMap = Map<number, ProcessInfo>;
