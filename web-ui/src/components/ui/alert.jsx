export function Alert({ children }) {
    return <div className="bg-yellow-100 p-4 rounded">{children}</div>;
  }
  
  export function AlertTitle({ children }) {
    return <h4 className="font-bold">{children}</h4>;
  }
  
  export function AlertDescription({ children }) {
    return <div>{children}</div>;
  }
  
  export function AlertDialog({ children }) {
    return <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">{children}</div>;
  }
  
  export function AlertDialogAction({ children, onClick }) {
    return <button onClick={onClick} className="bg-blue-500 text-white px-4 py-2 rounded">{children}</button>;
  }