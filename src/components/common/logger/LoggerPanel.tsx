import { LoggerMessage } from '@/hooks/ui/useLogger';
import LogConsole from './LogConsole';

const Colors = {
  info: 'text-log-info',
  error: 'text-log-error',
  warning: 'text-log-warning',
  success: 'text-log-success',
};

const LoggerPanel = ({ logs }: { logs: LoggerMessage[] }) => {
  return (
    <LogConsole scrollKey={logs}>
      {logs.map((log, index) => (
        <div key={index} className={Colors[log.type]}>
          {log.timestamp} - {log.message}
        </div>
      ))}
    </LogConsole>
  );
};

export default LoggerPanel;
