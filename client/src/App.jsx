import { Route, Routes } from 'react-router-dom';
import { useMeQuery } from './services/api.js';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import Auth from './pages/Auth.jsx';
import MyLearning from './pages/MyLearning.jsx';
import Learn from './pages/Learn.jsx';
import { Certificates, VerifyCertificate } from './pages/Certificates.jsx';
import { CheckoutSuccess, MockCheckout } from './pages/Checkout.jsx';
import Teach from './pages/teach/Teach.jsx';
import CourseEditor from './pages/teach/CourseEditor.jsx';
import Revenue from './pages/teach/Revenue.jsx';
import LiveList from './pages/live/LiveList.jsx';
import LiveRoom from './pages/live/LiveRoom.jsx';
import Admin from './pages/admin/Admin.jsx';

export default function App() {
  useMeQuery(); // hydrates the auth slice from the session cookie

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="courses/:slug" element={<CourseDetail />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="register" element={<Auth mode="register" />} />
        <Route path="verify/:code" element={<VerifyCertificate />} />

        <Route element={<ProtectedRoute />}>
          <Route path="my-learning" element={<MyLearning />} />
          <Route path="learn/:courseId" element={<Learn />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="checkout/mock/:paymentId" element={<MockCheckout />} />
          <Route path="checkout/success" element={<CheckoutSuccess />} />
          <Route path="live" element={<LiveList />} />
          <Route path="live/:id" element={<LiveRoom />} />
        </Route>

        <Route element={<ProtectedRoute roles={['instructor', 'admin']} />}>
          <Route path="teach" element={<Teach />} />
          <Route path="teach/courses/:courseId" element={<CourseEditor />} />
          <Route path="teach/revenue" element={<Revenue />} />
        </Route>

        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<div className="empty"><h3>Page not found</h3></div>} />
      </Route>
    </Routes>
  );
}
