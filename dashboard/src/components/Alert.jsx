import { AlertCircle, CheckCircle, XCircle, X } from 'lucide-react';

const styles = {
  error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', icon: XCircle, iconColor: 'text-red-500' },
  success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', icon: CheckCircle, iconColor: 'text-green-500' },
  warning: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-800', icon: AlertCircle, iconColor: 'text-yellow-500' },
};

export default function Alert({ type = 'error', message, onClose }) {
  if (!message) return null;
  const { bg, text, icon: Icon, iconColor } = styles[type];
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${bg} ${text}`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      <p className="text-sm flex-1">{message}</p>
      {onClose && (
        <button onClick={onClose} className="flex-shrink-0 opacity-60 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
