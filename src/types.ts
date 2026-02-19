
export interface WatcherConfig {
  basePorts: number[];
  range: number;
  interval: number;
  strategy: 'chain' | 'kill-base';
  filter: string[];
  dryRun: boolean;
  cwd?: string;
  maxAge?: number;
}

export interface ProcessInfo {
  pid: number;
  command: string;
  cwd?: string;
  creationDate?: string;
  ppid?: number;
}

export type PortMap = Map<number, ProcessInfo>;
