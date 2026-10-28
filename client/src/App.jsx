import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AddItemsPage from './features/add-items/AddItemsPage';
import StockPage from './features/stock/StockPage';
import SalesPage from './features/sales/SalesPage';
import ReportPage from './features/report/ReportPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/add" replace />} />
        <Route path="/add" element={<AddItemsPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/add" replace />} />
      </Route>
    </Routes>
  );
}
