import { LoggerMessage } from '@/hooks/ui/useLogger';

const Colors = {
  info: 'text-gray-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
  success: 'text-green-500',
};

const LoggerPanel = ({ logs }: { logs: LoggerMessage[] }) => {
  return (
    <div className='h-[150px] overflow-y-auto rounded-md bg-[#0c111d] p-2 font-mono text-sm text-[#94a3b8]'>
      {logs.map((log, index) => (
        <div key={index} className={Colors[log.type]}>
          {log.timestamp} - {log.message}
        </div>
      ))}
    </div>
  );
};

export default LoggerPanel;
