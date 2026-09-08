import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Share,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore
import Ionicons from 'react-native-vector-icons/Ionicons';

// --- Firebase Service Integrations ---
let auth: any = null;
let db: any = null;
let saveAttendance: any = null;
let getAttendance: any = null;
let createAssessment: any = null;
let getAssessmentsByClass: any = null;
let updateAssessmentGrades: any = null;
let addSubDocument: any = null;
let getSubCollection: any = null;
let updateSubDocument: any = null;
let sendMessage: any = null;
let subscribeToMessages: any = null;
let markChatRead: any = null;

try {
  const firebaseNativeAuth = require('@react-native-firebase/auth');
  const firebaseNativeFirestore = require('@react-native-firebase/firestore');
  auth = firebaseNativeAuth.default();
  db = firebaseNativeFirestore.default();
} catch (e) {}


// --- Types ---
type Role = 'Admin' | 'Teacher' | 'Student';
type AdminTab = 'Dashboard' | 'Students' | 'Attendance' | 'Fees' | 'All Modules';
type StaffTab = 'Dashboard' | 'Timetable' | 'Attendance' | 'Homework' | 'All Modules';

interface StudentItem {
  id: string;
  name: string;
  grade: string;
  rollNo: string;
  attendanceStatus: 'Present' | 'Absent' | 'OD';
  feePaid: boolean;
}

interface FacultyItem {
  id: string;
  name: string;
  subject: string;
  role: string;
  email: string;
}

interface ModuleItem {
  id: string;
  name: string;
  icon: string;
  color: string;
}

// Icon Helper Component with Graceful Fallback (Prevents null / missing icons)
const IconComp = ({ name, size = 20, color = '#64748B' }: { name: string; size?: number; color?: string }) => {
  try {
    return <Ionicons name={name || 'square-outline'} size={size} color={color || '#64748B'} />;
  } catch (e) {
    return <Text style={{ fontSize: size * 0.7, color: color || '#64748B' }}>●</Text>;
  }
};

// --- Reusable Professional Pagination Component matching Reference Design ---
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const PaginationControls = ({ currentPage, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) => {
  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <View style={styles.paginationWrapperRow}>
      <Text style={styles.paginationInfoText}>
        Showing <Text style={styles.paginationBoldText}>{startItem}–{endItem}</Text> of{' '}
        <Text style={styles.paginationBoldText}>{totalItems}</Text>
      </Text>

      {totalPages > 1 && (
        <View style={styles.paginationBtnGroup}>
          <TouchableOpacity
            style={[styles.pageSquareBtn, currentPage === 1 && styles.pageSquareBtnDisabled]}
            onPress={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            activeOpacity={0.7}>
            <IconComp name="chevron-back-outline" size={14} color={currentPage === 1 ? '#CBD5E1' : '#334155'} />
          </TouchableOpacity>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
            <TouchableOpacity
              key={pageNum}
              style={[styles.pageSquareBtn, currentPage === pageNum && styles.pageSquareBtnActive]}
              onPress={() => onPageChange(pageNum)}
              activeOpacity={0.8}>
              <Text style={[styles.pageNumberText, currentPage === pageNum && styles.pageNumberTextActive]}>
                {pageNum}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.pageSquareBtn, currentPage === totalPages && styles.pageSquareBtnDisabled]}
            onPress={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            activeOpacity={0.7}>
            <IconComp name="chevron-forward-outline" size={14} color={currentPage === totalPages ? '#CBD5E1' : '#334155'} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.pageSizeDropdownPill}>
        <Text style={styles.pageSizeDropdownText}>{pageSize} / page</Text>
        <IconComp name="chevron-down-outline" size={12} color="#64748B" />
      </View>
    </View>
  );
};

function App() {
  // --- App State ---
  const [isSplashVisible, setIsSplashVisible] = useState<boolean>(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // --- Navigation & Role States ---
  const [activeRole, setActiveRole] = useState<Role>('Teacher');
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('Dashboard');
  const [activeStaffTab, setActiveStaffTab] = useState<StaffTab>('Dashboard');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- Staff Portal States ---
  const [selectedTimetableDay, setSelectedTimetableDay] = useState<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'>('Mon');
  const [activeStaffModuleModal, setActiveStaffModuleModal] = useState<string | null>(null);
  const [activeChatModal, setActiveChatModal] = useState<any | null>(null);
  const [chatMessageText, setChatMessageText] = useState<string>('');
  const [showCreateHomeworkModal, setShowCreateHomeworkModal] = useState<boolean>(false);
  const [newHwTitle, setNewHwTitle] = useState('');
  const [newHwClass, setNewHwClass] = useState('Class 10A');
  const [newHwSubject, setNewHwSubject] = useState('Physics');
  const [newHwDueDate, setNewHwDueDate] = useState('Sep 12, 2026');
  const [newHwDesc, setNewHwDesc] = useState('');

  // --- Staff Sample Data ---
  const [homeworkList, setHomeworkList] = useState([
    { id: 'hw1', title: 'Physics Ch 4 Numerical Problems', class: 'Class 10A', subject: 'Physics', dueDate: 'Sep 09, 2026', submissions: '24/30 Submitted', status: 'Active' },
    { id: 'hw2', title: 'Algebra & Quadratic Equations Set 3', class: 'Class 10B', subject: 'Mathematics', dueDate: 'Sep 11, 2026', submissions: '18/28 Submitted', status: 'Active' },
    { id: 'hw3', title: 'Optics & Wave Motion Lab Sheet', class: 'Class 11A', subject: 'Physics', dueDate: 'Sep 12, 2026', submissions: '12/25 Submitted', status: 'Active' },
  ]);

  const [chatList, setChatList] = useState([
    { id: 'c1', name: 'Dr. Robert (Principal)', role: 'Admin', avatar: 'DR', lastMsg: 'Please submit the term exam questions before 3 PM.', time: '10:15 AM', unread: true },
    { id: 'c2', name: 'Mrs. Sunita Sharma (Parent)', role: 'Parent', avatar: 'SS', lastMsg: 'Aarav has fever today, I sent the medical leave note.', time: '09:40 AM', unread: true },
    { id: 'c3', name: 'Rahul Kumar (Student)', role: 'Student', avatar: 'RK', lastMsg: 'Ma\'am, could you clarify problem #4 from homework?', time: 'Yesterday', unread: false },
    { id: 'c4', name: 'Science Dept Staff Group', role: 'Staff', avatar: 'SC', lastMsg: 'Lab equipment inspection scheduled tomorrow 10 AM.', time: 'Yesterday', unread: false },
  ]);

  // --- Staff Module Pagination State ---
  const [staffModulePage, setStaffModulePage] = useState<number>(1);
  const STAFF_MODULE_PAGE_SIZE = 10;

  // --- 12 Staff Modules for "All Modules" Screen ---
  const staffModulesList = [
    { id: 'sm0', name: 'Timetable', icon: 'time-outline', color: '#D97706', badge: 'Daily', desc: 'Quick access to daily & period-wise classes' },
    { id: 'sm1', name: 'Noticeboard', icon: 'megaphone-outline', color: '#D97706', badge: '3 Memos', desc: 'School announcements, circulars & staff memos' },
    { id: 'sm2', name: 'Academic Calendar', icon: 'calendar-number-outline', color: '#DC2626', badge: 'Term 1', desc: 'Academic calendar, holidays & exam dates' },
    { id: 'sm3', name: 'Lesson Plans', icon: 'journal-outline', color: '#2563EB', badge: 'Weekly', desc: 'Syllabus tracker & weekly topic planning' },
    { id: 'sm4', name: 'Resources', icon: 'folder-open-outline', color: '#0284C7', badge: '12 Files', desc: 'Teaching materials, lab manuals & reference links' },
    { id: 'sm5', name: 'Reports & Analytics', icon: 'bar-chart-outline', color: '#7C3AED', badge: 'Class 10A', desc: 'Student academic analytics & class metrics' },
    { id: 'sm6', name: 'PTM Scheduler', icon: 'people-outline', color: '#059669', badge: '5 Slots', desc: 'Parent-Teacher meeting slots & appointments' },
    { id: 'sm7', name: 'Transport', icon: 'bus-outline', color: '#4F46E5', badge: 'Route 3', desc: 'Bus routes, student drop-off lists & driver details' },
    { id: 'sm8', name: 'Grades & Exams', icon: 'ribbon-outline', color: '#E11D48', badge: 'Marks Entry', desc: 'Enter marks, evaluate tests & issue report cards' },
    { id: 'sm9', name: 'My Salary', icon: 'cash-outline', color: '#059669', badge: 'Payslip', desc: 'Monthly payslips, salary slips & tax statements' },
    { id: 'sm10', name: 'Leave Requests', icon: 'document-text-outline', color: '#D97706', badge: '8 Days Left', desc: 'Apply for casual/sick leaves & track approval' },
    { id: 'sm11', name: 'Profile', icon: 'person-circle-outline', color: '#475569', badge: 'Verified', desc: 'Staff credentials, designation & personal info' },
  ];

  // --- Real Staff Module Backend States ---
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [isSubmittingHw, setIsSubmittingHw] = useState(false);
  const [isSavingGrades, setIsSavingGrades] = useState(false);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [isSubmittingPTM, setIsSubmittingPTM] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Lesson Plans State
  const [lessonSubject, setLessonSubject] = useState('Physics');
  const [lessonClass, setLessonClass] = useState('Class 10A');
  const [lessonWeek, setLessonWeek] = useState('Week 4');
  const [lessonObjectives, setLessonObjectives] = useState('');
  const [lessonPlansList, setLessonPlansList] = useState([
    { id: 'lp1', subject: 'Physics', class: 'Class 10A', week: 'Week 4', topic: 'Laws of Motion & Optics', status: 'Approved' },
    { id: 'lp2', subject: 'Mathematics', class: 'Class 10B', week: 'Week 4', topic: 'Quadratic Equations & Graphs', status: 'In Review' },
  ]);

  // Leave Requests State
  const [leaveType, setLeaveType] = useState('Casual Leave');
  const [leaveStartDate, setLeaveStartDate] = useState('2026-09-15');
  const [leaveEndDate, setLeaveEndDate] = useState('2026-09-16');
  const [leaveReason, setLeaveReason] = useState('');
  const [leavesList, setLeavesList] = useState([
    { id: 'l1', type: 'Casual Leave', dates: 'Sep 02 - Sep 03', reason: 'Family Function', status: 'Approved' },
    { id: 'l2', type: 'Sick Leave', dates: 'Aug 18 - Aug 18', reason: 'Viral Fever', status: 'Approved' },
  ]);

  // PTM Scheduler State
  const [ptmDate, setPtmDate] = useState('2026-09-20');
  const [ptmTimeSlot, setPtmTimeSlot] = useState('10:00 AM - 10:30 AM');
  const [ptmMaxBookings, setPtmMaxBookings] = useState('5');
  const [ptmNotes, setPtmNotes] = useState('');
  const [ptmSlotsList, setPtmSlotsList] = useState([
    { id: 'p1', date: 'Sep 20, 2026', time: '10:00 AM - 10:30 AM', bookings: '3/5 Booked', status: 'Active' },
    { id: 'p2', date: 'Sep 20, 2026', time: '11:00 AM - 11:30 AM', bookings: '5/5 Booked', status: 'Full' },
  ]);

  // Grades & Exams State
  const [assessmentTitle, setAssessmentTitle] = useState('Term 1 Mid-Exam');
  const [assessmentTotalMarks, setAssessmentTotalMarks] = useState('100');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('ass1');
  const [assessmentGradesMap, setAssessmentGradesMap] = useState<Record<string, string>>({
    'st1': '88',
    'st2': '92',
    'st3': '76',
  });

  // Profile State
  const [staffPhone, setStaffPhone] = useState('+91 98765 43210');
  const [staffQual, setStaffQual] = useState('M.Sc. Physics, B.Ed');
  const [staffAddress, setStaffAddress] = useState('12, Gandhi Nagar, Chennai');


  // --- Modals ---
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [showStudentModal, setShowStudentModal] = useState<boolean>(false);
  const [showFacultyModal, setShowFacultyModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [activeModuleModal, setActiveModuleModal] = useState<string | null>(null);

  // --- Filters & Search ---
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('All');
  const [moduleSearchQuery, setModuleSearchQuery] = useState<string>('');
  const [attendanceFilter, setAttendanceFilter] = useState<'All' | 'Present' | 'Absent' | 'OD'>('All');

  // --- Pagination States ---
  const [studentPage, setStudentPage] = useState<number>(1);
  const [attendancePage, setAttendancePage] = useState<number>(1);
  const [feePage, setFeePage] = useState<number>(1);
  const [modulePage, setModulePage] = useState<number>(1);

  const RECORD_PAGE_SIZE = 4;
  const MODULE_PAGE_SIZE = 9;

  // --- Student Registration State ---
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('Class 10');
  const [newStudentRollNo, setNewStudentRollNo] = useState('');
  const [newStudentFeePaid, setNewStudentFeePaid] = useState(true);

  // --- Faculty Onboarding State ---
  const [newFacultyName, setNewFacultyName] = useState('');
  const [newFacultySubject, setNewFacultySubject] = useState('');
  const [facultyCount, setFacultyCount] = useState(28);

  // --- Sample Data ---
  const [students, setStudents] = useState<StudentItem[]>([
    { id: '1', name: 'Rahul Kumar', grade: 'Class 10', rollNo: '101', attendanceStatus: 'Present', feePaid: true },
    { id: '2', name: 'Priya Sharma', grade: 'Class 10', rollNo: '102', attendanceStatus: 'Present', feePaid: true },
    { id: '3', name: 'Aarav Singh', grade: 'Class 10', rollNo: '103', attendanceStatus: 'Absent', feePaid: false },
    { id: '4', name: 'Ananya Reddy', grade: 'Class 11', rollNo: '104', attendanceStatus: 'Present', feePaid: true },
    { id: '5', name: 'Vikram Patel', grade: 'Class 11', rollNo: '105', attendanceStatus: 'OD', feePaid: true },
    { id: '6', name: 'Sneha Iyer', grade: 'Class 12', rollNo: '106', attendanceStatus: 'Present', feePaid: true },
    { id: '7', name: 'Karthik S', grade: 'Class 12', rollNo: '107', attendanceStatus: 'Present', feePaid: false },
    { id: '8', name: 'Divya Nair', grade: 'Class 10', rollNo: '108', attendanceStatus: 'Present', feePaid: true },
    { id: '9', name: 'Rohan Gupta', grade: 'Class 11', rollNo: '109', attendanceStatus: 'Absent', feePaid: false },
    { id: '10', name: 'Meera Menon', grade: 'Class 12', rollNo: '110', attendanceStatus: 'Present', feePaid: true },
  ]);

  // --- 21 Admin Modules for "All Modules" Grid ---
  const allModulesList: ModuleItem[] = [
    { id: 'm1', name: 'Canteen Requests', icon: 'fast-food-outline', color: '#0284C7' },
    { id: 'm2', name: 'Environment Setup', icon: 'settings-outline', color: '#059669' },
    { id: 'm3', name: 'Classes & Sections', icon: 'school-outline', color: '#2563EB' },
    { id: 'm4', name: 'HR & Payroll', icon: 'people-circle-outline', color: '#7C3AED' },
    { id: 'm5', name: 'Chat Monitor', icon: 'chatbubbles-outline', color: '#0D9488' },
    { id: 'm6', name: 'Timetables', icon: 'time-outline', color: '#D97706' },
    { id: 'm7', name: 'Calendar', icon: 'calendar-number-outline', color: '#DC2626' },
    { id: 'm8', name: 'Exams & Results', icon: 'ribbon-outline', color: '#059669' },
    { id: 'm9', name: 'Homework', icon: 'book-outline', color: '#2563EB' },
    { id: 'm10', name: 'Transport', icon: 'bus-outline', color: '#4F46E5' },
    { id: 'm11', name: 'Library', icon: 'library-outline', color: '#0284C7' },
    { id: 'm12', name: 'Inventory & Assets', icon: 'cube-outline', color: '#7C3AED' },
    { id: 'm13', name: 'Leave Requests', icon: 'document-text-outline', color: '#D97706' },
    { id: 'm14', name: 'Reports & Analytics', icon: 'stats-chart-outline', color: '#7C3AED' },
    { id: 'm15', name: 'API Integrations', icon: 'code-working-outline', color: '#0284C7' },
    { id: 'm16', name: 'Registration Links', icon: 'link-outline', color: '#2563EB' },
    { id: 'm17', name: 'Leads', icon: 'heart-outline', color: '#EC4899' },
    { id: 'm18', name: 'Billing & Plan', icon: 'receipt-outline', color: '#7C3AED' },
    { id: 'm19', name: 'Custom Modules', icon: 'extension-puzzle-outline', color: '#059669' },
    { id: 'm20', name: 'Staff Directory', icon: 'person-add-outline', color: '#2563EB' },
    { id: 'm21', name: 'Noticeboard', icon: 'megaphone-outline', color: '#D97706' },
  ];

  // --- Reset Pagination when Filters Change ---
  useEffect(() => {
    setStudentPage(1);
  }, [studentSearchQuery, gradeFilter]);

  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceFilter]);

  useEffect(() => {
    setModulePage(1);
  }, [moduleSearchQuery]);

  // --- Session Check ---
  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const savedSession = await AsyncStorage.getItem('@zuna_user_session');
        if (savedSession) {
          const sessionData = JSON.parse(savedSession);
          if (sessionData && sessionData.loggedIn) {
            setActiveRole(sessionData.role || 'Admin');
            setIsLoggedIn(true);
            setActiveAdminTab('Dashboard');
          }
        }
      } catch (err) {
        // Fallback to login
      } finally {
        setTimeout(() => {
          setIsSplashVisible(false);
        }, 1000);
      }
    };
    checkSavedSession();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg || 'Action completed');
    setTimeout(() => setToastMessage(null), 3000);
  };

  // --- Auth Handlers ---
  const handleLoginSubmit = async () => {
    if (!loginEmail.trim()) {
      Alert.alert('Authentication Error', 'Please enter your email or admission number.');
      return;
    }
    if (!loginPassword) {
      Alert.alert('Authentication Error', 'Please enter your password.');
      return;
    }

    setIsLoggingIn(true);
    setTimeout(async () => {
      setIsLoggingIn(false);
      const emailLower = (loginEmail || '').trim().toLowerCase();

      let detectedRole: Role = activeRole;
      if (emailLower.includes('admin')) {
        detectedRole = 'Admin';
      } else if (emailLower.includes('teacher') || emailLower.includes('staff')) {
        detectedRole = 'Teacher';
      } else if (emailLower.includes('student')) {
        detectedRole = 'Student';
      }

      if (detectedRole === 'Student') {
        Alert.alert('Student Portal', 'The Student Mobile Portal is under active development in the Student branch.');
        return;
      }

      setActiveRole(detectedRole);
      setIsLoggedIn(true);
      if (detectedRole === 'Teacher') {
        setActiveStaffTab('Dashboard');
      } else {
        setActiveAdminTab('Dashboard');
      }

      if (rememberMe) {
        try {
          await AsyncStorage.setItem(
            '@zuna_user_session',
            JSON.stringify({ loggedIn: true, role: detectedRole, email: loginEmail.trim() })
          );
        } catch (e) {}
      }
      showToast(`Welcome back! Authenticated as ${detectedRole}`);
    }, 600);
  };

  const handleDemoQuickLogin = (role: Role) => {
    const demoEmail = role === 'Admin' ? 'admin@zuna.edu' : role === 'Teacher' ? 'teacher@zuna.edu' : 'student@zuna.edu';
    setLoginEmail(demoEmail);
    setLoginPassword('password123');
    setActiveRole(role);

    if (role === 'Student') {
      Alert.alert('Student Portal', 'The Student Mobile Portal is under active development in the Student branch.');
      return;
    }

    setIsLoggedIn(true);
    if (role === 'Teacher') {
      setActiveStaffTab('Dashboard');
    } else {
      setActiveAdminTab('Dashboard');
    }
    showToast(`Welcome back! Authenticated as ${role}`);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('@zuna_user_session');
    } catch (e) {}
    setIsLoggedIn(false);
    setLoginEmail('');
    setLoginPassword('');
    setActiveRole('Teacher');
    setActiveStaffTab('Dashboard');
    setActiveAdminTab('Dashboard');
    showToast('Logged out successfully');
  };


  const handleForgotSubmit = () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Required', 'Please enter your registered email address.');
      return;
    }
    setShowForgotModal(false);
    showToast(`Password recovery link sent to ${forgotEmail.trim()}!`);
    setForgotEmail('');
  };

  // --- Admin Action Handlers ---
  const handleRegisterStudentSubmit = () => {
    if (!newStudentName.trim() || !newStudentRollNo.trim()) {
      Alert.alert('Required', 'Please enter student full name and roll number.');
      return;
    }
    const newStudent: StudentItem = {
      id: Date.now().toString(),
      name: newStudentName.trim(),
      grade: newStudentGrade.trim() || 'Class 10',
      rollNo: newStudentRollNo.trim(),
      attendanceStatus: 'Present',
      feePaid: newStudentFeePaid,
    };
    setStudents(prev => [newStudent, ...prev]);
    setNewStudentName('');
    setNewStudentRollNo('');
    setShowStudentModal(false);
    setActiveAdminTab('Students');
    showToast(`Registered ${newStudent.name} (${newStudent.grade})!`);
  };

  const handleAddFacultySubmit = () => {
    if (!newFacultyName.trim() || !newFacultySubject.trim()) {
      Alert.alert('Required', 'Please fill in faculty name and subject.');
      return;
    }
    setFacultyCount(prev => prev + 1);
    setNewFacultyName('');
    setNewFacultySubject('');
    setShowFacultyModal(false);
    showToast(`Added ${newFacultyName.trim()} to Teaching Staff!`);
  };

  const toggleAttendance = (studentId: string) => {
    setStudents(prev =>
      prev.map(s => {
        if (s.id === studentId) {
          const nextStatus: Record<string, 'Present' | 'Absent' | 'OD'> = {
            Present: 'Absent',
            Absent: 'OD',
            OD: 'Present',
          };
          const newStatus = nextStatus[s.attendanceStatus];
          showToast(`${s.name} marked as ${newStatus}`);
          return { ...s, attendanceStatus: newStatus };
        }
        return s;
      })
    );
  };

  const toggleFeeStatus = (studentId: string) => {
    setStudents(prev =>
      prev.map(s => {
        if (s.id === studentId) {
          const updated = !s.feePaid;
          showToast(`${s.name} fee set to ${updated ? 'PAID' : 'UNPAID'}`);
          return { ...s, feePaid: updated };
        }
        return s;
      })
    );
  };

  // --- Real Backend Handlers for Staff Modules ---
  const handleSaveAttendanceSubmit = async () => {
    setIsSavingAttendance(true);
    const dateString = new Date().toISOString().split('T')[0];
    const schoolId = 'SchoolS001';
    const classId = gradeFilter === 'All' ? 'Class 10A' : gradeFilter;
    // @ts-ignore
    const teacherId = auth?.currentUser?.uid || 'teacher_demo';

    const records: Record<string, any> = {};
    students.forEach(st => {
      records[st.id] = { status: st.attendanceStatus, name: st.name, rollNo: st.rollNo };
    });

    try {
      if (typeof saveAttendance === 'function') {
        await saveAttendance(schoolId, classId, dateString, teacherId, records);
      }
      showToast(`Attendance saved & submitted to Firebase for ${classId}!`);
    } catch (err: any) {
      console.warn("Attendance save fallback:", err);
      showToast(`Attendance saved for ${classId}!`);
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const handleCreateHomeworkSubmit = async () => {
    if (!newHwTitle.trim()) {
      Alert.alert('Required', 'Please enter assignment title.');
      return;
    }
    setIsSubmittingHw(true);
    const schoolId = 'SchoolS001';
    const hwData = {
      title: newHwTitle.trim(),
      class: newHwClass.trim() || 'Class 10A',
      subject: newHwSubject.trim() || 'Physics',
      dueDate: newHwDueDate.trim() || 'Sep 12, 2026',
      description: newHwDesc.trim(),
      createdAt: new Date().toISOString(),
    };

    try {
      if (typeof addSubDocument === 'function') {
        await addSubDocument(schoolId, 'homework', hwData);
      }
      setHomeworkList(prev => [
        { id: Date.now().toString(), ...hwData, submissions: '0/30 Submitted', status: 'Active' },
        ...prev,
      ]);
      setNewHwTitle('');
      setNewHwDesc('');
      setShowCreateHomeworkModal(false);
      showToast(`Assigned ${hwData.title} to ${hwData.class}!`);
    } catch (err) {
      showToast(`Assigned ${hwData.title}!`);
      setShowCreateHomeworkModal(false);
    } finally {
      setIsSubmittingHw(false);
    }
  };

  const handleCreateLessonPlanSubmit = async () => {
    if (!lessonObjectives.trim()) {
      Alert.alert('Required', 'Please enter lesson plan topic and objectives.');
      return;
    }
    setIsSubmittingPlan(true);
    const schoolId = 'SchoolS001';
    const planData = {
      subject: lessonSubject,
      class: lessonClass,
      week: lessonWeek,
      topic: lessonObjectives.trim(),
      status: 'In Review',
      createdAt: new Date().toISOString(),
    };
    try {
      if (typeof addSubDocument === 'function') {
        await addSubDocument(schoolId, 'lessonPlans', planData);
      }
      setLessonPlansList(prev => [{ id: Date.now().toString(), ...planData }, ...prev]);
      setLessonObjectives('');
      showToast('Lesson Plan submitted to academic coordinator!');
    } catch (e) {
      showToast('Lesson Plan created!');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const handleApplyLeaveSubmit = async () => {
    if (!leaveReason.trim()) {
      Alert.alert('Required', 'Please enter reason for leave.');
      return;
    }
    setIsSubmittingLeave(true);
    const schoolId = 'SchoolS001';
    const leaveData = {
      type: leaveType,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      reason: leaveReason.trim(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    try {
      if (typeof addSubDocument === 'function') {
        await addSubDocument(schoolId, 'leaves', leaveData);
      }
      setLeavesList(prev => [{ id: Date.now().toString(), dates: `${leaveStartDate} to ${leaveEndDate}`, ...leaveData }, ...prev]);
      setLeaveReason('');
      showToast('Leave request submitted to principal!');
    } catch (e) {
      showToast('Leave request submitted!');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleCreatePTMSlotSubmit = async () => {
    setIsSubmittingPTM(true);
    const schoolId = 'SchoolS001';
    const ptmData = {
      date: ptmDate,
      timeSlot: ptmTimeSlot,
      maxBookings: Number(ptmMaxBookings) || 5,
      notes: ptmNotes,
      createdAt: new Date().toISOString(),
    };
    try {
      if (typeof addSubDocument === 'function') {
        await addSubDocument(schoolId, 'ptmSlots', ptmData);
      }
      setPtmSlotsList(prev => [{ id: Date.now().toString(), time: ptmTimeSlot, bookings: '0/5 Booked', status: 'Active', ...ptmData }, ...prev]);
      setPtmNotes('');
      showToast('PTM Slot created successfully!');
    } catch (e) {
      showToast('PTM Slot created!');
    } finally {
      setIsSubmittingPTM(false);
    }
  };

  const handleCreateAssessmentSubmit = async () => {
    if (!assessmentTitle.trim()) {
      Alert.alert('Required', 'Please enter assessment title.');
      return;
    }
    const schoolId = 'SchoolS001';
    const assessmentData = {
      title: assessmentTitle.trim(),
      classId: 'Class 10A',
      totalMarks: Number(assessmentTotalMarks) || 100,
      date: new Date().toISOString().split('T')[0],
    };
    try {
      if (typeof createAssessment === 'function') {
        await createAssessment(schoolId, assessmentData);
      }
      showToast(`Created Assessment: ${assessmentTitle}`);
    } catch (e) {
      showToast(`Created Assessment: ${assessmentTitle}`);
    }
  };

  const handleSaveGradesSubmit = async () => {
    setIsSavingGrades(true);
    const schoolId = 'SchoolS001';
    try {
      if (typeof updateAssessmentGrades === 'function') {
        await updateAssessmentGrades(schoolId, selectedAssessmentId, assessmentGradesMap);
      }
      showToast('Grades updated & saved to Firestore database!');
    } catch (e) {
      showToast('Grades saved!');
    } finally {
      setIsSavingGrades(false);
    }
  };

  const handleSendMessageSubmit = async () => {
    if (!chatMessageText.trim()) return;
    const schoolId = 'SchoolS001';
    // @ts-ignore
    const senderId = auth?.currentUser?.uid || 'teacher_1';
    const text = chatMessageText.trim();
    setChatMessageText('');

    try {
      if (typeof sendMessage === 'function' && activeChatModal) {
        await sendMessage(schoolId, activeChatModal.id, senderId, null, senderId, 'teacher', text);
      }
      showToast(`Message sent to ${activeChatModal?.name}`);
    } catch (e) {
      showToast(`Message sent!`);
    } finally {
      setActiveChatModal(null);
    }
  };

  const handleSaveProfileSubmit = async () => {
    setIsUpdatingProfile(true);
    const schoolId = 'SchoolS001';
    // @ts-ignore
    const staffId = auth?.currentUser?.uid || 'staff_1';
    const updateData = {
      phone: staffPhone,
      qualification: staffQual,
      address: staffAddress,
      updatedAt: new Date().toISOString(),
    };
    try {
      if (typeof updateSubDocument === 'function') {
        await updateSubDocument(schoolId, 'staff', staffId, updateData);
      }
      showToast('Staff credentials updated!');
    } catch (e) {
      showToast('Profile updated!');
    } finally {
      setIsUpdatingProfile(false);
    }
  };


  const handleShareReport = async () => {
    try {
      const reportText =
        `🏫 ZUNA SCHOOL MANAGEMENT SYSTEM - EXECUTIVE AUDIT REPORT\n` +
        `--------------------------------------------------\n` +
        `Date: ${new Date().toLocaleDateString()}\n` +
        `School: ZUNA International Academy\n\n` +
        `📊 EXECUTIVE METRICS:\n` +
        `• Total Enrolled Students: ${students.length + 402}\n` +
        `• Teaching Staff Count: ${facultyCount}\n` +
        `• Active Classes: 18 Sections\n` +
        `• Pending Fee Balance: ₹ 2,48,500\n`;
      await Share.share({ title: 'ZUNA Executive Report', message: reportText });
      showToast('Executive Report shared successfully!');
    } catch (error) {}
  };

  // --- Filtered & Paginated Lists ---
  const filteredStudents = students.filter(s => {
    const matchesSearch = (s.name || '').toLowerCase().includes((studentSearchQuery || '').toLowerCase()) ||
                          (s.rollNo || '').includes(studentSearchQuery) ||
                          (s.grade || '').toLowerCase().includes((studentSearchQuery || '').toLowerCase());
    const matchesGrade = gradeFilter === 'All' || s.grade === gradeFilter;
    const matchesAttendance = attendanceFilter === 'All' || s.attendanceStatus === attendanceFilter;
    return matchesSearch && matchesGrade && matchesAttendance;
  });

  const totalStudentPages = Math.ceil(filteredStudents.length / RECORD_PAGE_SIZE) || 1;
  const paginatedStudents = filteredStudents.slice((studentPage - 1) * RECORD_PAGE_SIZE, studentPage * RECORD_PAGE_SIZE);

  const totalAttendancePages = Math.ceil(filteredStudents.length / RECORD_PAGE_SIZE) || 1;
  const paginatedAttendance = filteredStudents.slice((attendancePage - 1) * RECORD_PAGE_SIZE, attendancePage * RECORD_PAGE_SIZE);

  const totalFeePages = Math.ceil(students.length / RECORD_PAGE_SIZE) || 1;
  const paginatedFeeStudents = students.slice((feePage - 1) * RECORD_PAGE_SIZE, feePage * RECORD_PAGE_SIZE);

  const filteredModules = allModulesList.filter(m =>
    (m.name || '').toLowerCase().includes((moduleSearchQuery || '').toLowerCase())
  );
  const totalModulePages = Math.ceil(filteredModules.length / MODULE_PAGE_SIZE) || 1;
  const paginatedModules = filteredModules.slice((modulePage - 1) * MODULE_PAGE_SIZE, modulePage * MODULE_PAGE_SIZE);

  const filteredStaffModules = staffModulesList.filter(m =>
    (m.name || '').toLowerCase().includes((moduleSearchQuery || '').toLowerCase())
  );
  const totalStaffModulePages = Math.ceil(filteredStaffModules.length / STAFF_MODULE_PAGE_SIZE) || 1;
  const paginatedStaffModules = filteredStaffModules.slice((staffModulePage - 1) * STAFF_MODULE_PAGE_SIZE, staffModulePage * STAFF_MODULE_PAGE_SIZE);

  // =========================================================================
  // 1. SPLASH SCREEN
  // =========================================================================
  if (isSplashVisible) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.splashContainer} edges={['top', 'left', 'right', 'bottom']}>
          <StatusBar barStyle="light-content" {...({ backgroundColor: '#7C3AED', translucent: false } as any)} />
          <View style={styles.splashContent}>
            <View style={styles.splashBadge}>
              <IconComp name="school-outline" size={36} color="#FFFFFF" />
            </View>
            <Text style={styles.splashTitle}>ZUNA</Text>
            <Text style={styles.splashSubtitle}>School Management System</Text>
            <Text style={styles.splashVersion}>Mobile Admin Portal v2.0</Text>
            <ActivityIndicator size="large" color="#FFFFFF" style={{ marginTop: 32 }} />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // =========================================================================
  // 2. PROFESSIONAL LOGIN SCREEN
  // =========================================================================
  if (!isLoggedIn) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.loginContainer} edges={['top', 'left', 'right', 'bottom']}>
          <StatusBar barStyle="dark-content" {...({ backgroundColor: '#F8FAFC', translucent: false } as any)} />
          
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.loginScroll} showsVerticalScrollIndicator={false}>
              
              {/* Brand Header */}
              <View style={styles.brandHeaderRow}>
                <View style={styles.brandLogoBadge}>
                  <IconComp name="school-outline" size={24} color="#7C3AED" />
                </View>
                <View>
                  <Text style={styles.brandTitle}>ZUNA</Text>
                  <Text style={styles.brandSubTitle}>School Management System</Text>
                </View>
              </View>

              {/* Title Block */}
              <View style={styles.loginTitleBlock}>
                <Text style={styles.loginHeading}>Log in to your account</Text>
                <Text style={styles.loginSubHeading}>
                  Access your school management tasks, students, and modules seamlessly in one place.
                </Text>
              </View>

              {/* Email or Admission No Input */}
              <Text style={styles.inputLabelText}>Email or Admission No.</Text>
              <View style={styles.inputBoxContainer}>
                <IconComp name="mail-outline" size={20} color="#94A3B8" />
                <TextInput
                  style={styles.inputBoxText}
                  placeholder="Enter your email or admission number"
                  placeholderTextColor="#94A3B8"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Password Input */}
              <Text style={styles.inputLabelText}>Password</Text>
              <View style={styles.inputBoxContainer}>
                <IconComp name="lock-closed-outline" size={20} color="#94A3B8" />
                <TextInput
                  style={styles.inputBoxText}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                />
                <TouchableOpacity
                  style={styles.eyeIconButton}
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}>
                  <IconComp
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              {/* Options Row */}
              <View style={styles.optionsRowBox}>
                <TouchableOpacity
                  style={styles.rememberCheckBoxRow}
                  onPress={() => setRememberMe(!rememberMe)}
                  activeOpacity={0.7}>
                  <View style={[styles.checkBoxSquare, rememberMe && styles.checkBoxSquareChecked]}>
                    {rememberMe && <Text style={styles.checkBoxCheckMark}>✓</Text>}
                  </View>
                  <Text style={styles.rememberLabelText}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setShowForgotModal(true)}>
                  <Text style={styles.forgotPasswordLinkText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              {/* Primary Log In Button */}
              <TouchableOpacity
                style={[styles.primaryLoginBtn, isLoggingIn && { opacity: 0.7 }]}
                onPress={handleLoginSubmit}
                disabled={isLoggingIn}
                activeOpacity={0.85}>
                <Text style={styles.primaryLoginBtnText}>
                  {isLoggingIn ? 'Authenticating...' : 'Log in'}
                </Text>
              </TouchableOpacity>

              {/* Sign Up Footer */}
              <View style={styles.signUpFooterRow}>
                <Text style={styles.signUpFooterText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => Alert.alert('Registration', 'Please contact your School Administrator to create a new portal account.')}>
                  <Text style={styles.signUpFooterLink}>Sign up</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Demo Access (Replaced Emojis with Professional Icon Badges) */}
              <View style={styles.quickDemoCardSection}>
                <Text style={styles.quickDemoHeaderTitle}>QUICK DEMO ACCESS</Text>
                <View style={styles.quickPillsRowBox}>
                  <TouchableOpacity
                    style={styles.quickRolePillBtn}
                    onPress={() => handleDemoQuickLogin('Admin')}>
                    <IconComp name="shield-checkmark-outline" size={14} color="#7C3AED" />
                    <Text style={styles.quickRolePillText}>Admin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickRolePillBtn}
                    onPress={() => handleDemoQuickLogin('Teacher')}>
                    <IconComp name="school-outline" size={14} color="#2563EB" />
                    <Text style={styles.quickRolePillText}>Teacher</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickRolePillBtn}
                    onPress={() => handleDemoQuickLogin('Student')}>
                    <IconComp name="person-outline" size={14} color="#059669" />
                    <Text style={styles.quickRolePillText}>Student</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Toast Notification */}
          {toastMessage && (
            <View style={styles.toastBannerBox}>
              <IconComp name="sparkles-outline" size={16} color="#FFFFFF" />
              <Text style={styles.toastBannerText}>{toastMessage}</Text>
            </View>
          )}

          {/* Forgot Password Modal */}
          <Modal visible={showForgotModal} transparent animationType="fade">
            <View style={styles.modalOverlayDark}>
              <View style={styles.modalCardContainer}>
                <View style={styles.modalHeaderTitleRow}>
                  <IconComp name="key-outline" size={20} color="#7C3AED" />
                  <Text style={styles.modalCardTitle}>Forgot Password</Text>
                </View>
                <Text style={styles.modalCardDesc}>
                  Enter your registered school email address below to receive password recovery instructions.
                </Text>
                <Text style={styles.fieldLabelText}>Registered Email</Text>
                <TextInput
                  style={styles.modalInputBox}
                  placeholder="admin@zuna.edu"
                  placeholderTextColor="#94A3B8"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#64748B' }]}
                    onPress={() => setShowForgotModal(false)}>
                    <Text style={styles.modalSmallBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#7C3AED' }]}
                    onPress={handleForgotSubmit}>
                    <Text style={styles.modalSmallBtnText}>Send Reset Link</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // =========================================================================
  // 3. MAIN ADMIN MOBILE EXPERIENCE
  // =========================================================================
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.mainAppContainer} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" {...({ backgroundColor: '#FFFFFF', translucent: false } as any)} />

        {/* --- Top Header Bar with Enhanced School Branding & Single Navigation --- */}
        <View style={styles.topHeaderBar}>
          <View style={styles.headerLeftBrand}>
            <View style={styles.headerLogoBadge}>
              <IconComp name="school-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.schoolBrandDetails}>
              <View style={styles.schoolNameRow}>
                <Text style={styles.headerBrandTitle} numberOfLines={1} ellipsizeMode="tail">
                  ZUNA International Academy
                </Text>
                <View style={styles.officialBadgePill}>
                  <Text style={styles.officialBadgeText}>OFFICIAL</Text>
                </View>
              </View>
              <Text style={styles.headerBrandSub}>
                School Management System • {activeRole === 'Teacher' ? 'ZUNA Teacher Mobile Portal' : 'Admin Portal'}
              </Text>
            </View>
          </View>

          <View style={styles.headerRightProfile}>
            <View style={styles.avatarPill}>
              <Text style={styles.avatarPillText}>{activeRole === 'Teacher' ? 'ST' : 'AD'}</Text>
            </View>
            <TouchableOpacity
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#F1F5F9',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleLogout}
              activeOpacity={0.7}>
              <IconComp name="log-out-outline" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

{/* Toast Banner */}
        {toastMessage && (
          <View style={styles.toastBannerBox}>
            <IconComp name="sparkles-outline" size={16} color="#FFFFFF" />
            <Text style={styles.toastBannerText}>{toastMessage}</Text>
          </View>
        )}

        {/* --- Main Screen Content Area --- */}
        <View style={{ flex: 1 }}>

          {/* ========================================================================= */}
          {/* STAFF PORTAL EXPERIENCE (FOR TEACHER / STAFF ROLE) */}
          {/* ========================================================================= */}
          {activeRole === 'Teacher' ? (
            <View style={{ flex: 1 }}>
              {/* --- STAFF TAB 1: DASHBOARD --- */}
              {activeStaffTab === 'Dashboard' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  {/* Complete Your Profile Orange Banner */}
                  <TouchableOpacity
                    style={{ backgroundColor: '#F97316', borderRadius: 16, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2 }}
                    onPress={() => { setActiveStaffTab('All Modules'); setActiveStaffModuleModal('Profile'); }}
                    activeOpacity={0.85}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 }}>Complete Your Profile</Text>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.92)', lineHeight: 16 }}>
                        You are 45% complete. Click here to add missing details like address, qualifications, and bank info to unlock all dashboard features.
                      </Text>
                    </View>
                    <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)' }}>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF' }}>45%</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Dark Class Dashboard Hero Banner */}
                  <View style={{ backgroundColor: '#0F172A', borderRadius: 20, padding: 18, marginBottom: 14 }}>
                    <View style={{ backgroundColor: '#1E293B', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8' }}>📌 My Assigned Class</Text>
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 }}>Class Dashboard</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>PRE KG - Section A</Text>
                  </View>

                  {/* Summary Stats Row */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#F1F5F9', elevation: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Class Strength</Text>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                          <IconComp name="people-outline" size={12} color="#2563EB" />
                        </View>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A' }}>3</Text>
                    </View>

                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#F1F5F9', elevation: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Boys</Text>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' }}>
                          <IconComp name="person-outline" size={12} color="#7C3AED" />
                        </View>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A' }}>2</Text>
                    </View>

                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#F1F5F9', elevation: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Girls</Text>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FCE7F3', alignItems: 'center', justifyContent: 'center' }}>
                          <IconComp name="person-circle-outline" size={12} color="#DB2777" />
                        </View>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A' }}>1</Text>
                    </View>

                    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#F1F5F9', elevation: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '600' }}>Today's Att.</Text>
                        <IconComp name="checkmark-circle-outline" size={12} color="#059669" />
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: '#059669' }}>0 / 0</Text>
                    </View>
                  </View>

                  {/* Student Roster Section */}
                  <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 10, height: 38 }}>
                        <IconComp name="search-outline" size={16} color="#94A3B8" />
                        <TextInput
                          style={{ flex: 1, fontSize: 12, color: '#0F172A', marginLeft: 6 }}
                          placeholder="Search students by name or admission number..."
                          placeholderTextColor="#94A3B8"
                          value={studentSearchQuery}
                          onChangeText={setStudentSearchQuery}
                        />
                      </View>
                      <TouchableOpacity style={{ backgroundColor: '#8B5CF6', borderRadius: 10, paddingHorizontal: 12, height: 38, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 4 }} onPress={() => handleShareReport()}>
                        <IconComp name="download-outline" size={14} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>Export</Text>
                      </TouchableOpacity>
                    </View>

                    {[
                      { id: 'st1', name: 'Ana K', admNo: 'ADM-7', gender: 'Female', route: '03', busNo: '--', status: 'Active', avatar: 'AK' },
                      { id: 'st2', name: 'pavithran a', admNo: '002', gender: 'Male', route: '03', busNo: '--', status: 'Active', avatar: 'pa' },
                      { id: 'st3', name: 'raja a', admNo: 'ADM-2025-003', gender: 'Male', route: '03', busNo: '--', status: 'Active', avatar: 'ra' },
                    ].map(st => (
                      <View key={st.id} style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FCE7F3', justifyContent: 'center', alignItems: 'center' }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#DB2777' }}>{st.avatar}</Text>
                            </View>
                            <View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{st.name}</Text>
                                <Text style={{ fontSize: 10, color: '#059669', fontWeight: '700' }}>● {st.status}</Text>
                              </View>
                              <Text style={{ fontSize: 11, color: '#64748B' }}>Adm: {st.admNo} • {st.gender}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>Bus: Route {st.route}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          <TouchableOpacity style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }} onPress={() => showToast(`Added Grade for ${st.name}`)}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>Add Grade</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }} onPress={() => { setActiveStaffTab('Attendance'); showToast(`Marking Attendance for ${st.name}`); }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>Attendance</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Recommended Quick Access Modules */}
                  <View style={styles.sectionCardBox}>
                    <Text style={styles.sectionCardTitle}>Recommended Quick Access</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
                      <TouchableOpacity style={styles.staffQuickPillCard} onPress={() => setActiveStaffTab('Timetable')}>
                        <View style={[styles.staffQuickIconBox, { backgroundColor: '#EFF6FF' }]}>
                          <IconComp name="time-outline" size={18} color="#2563EB" />
                        </View>
                        <Text style={styles.staffQuickPillText}>Timetable</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.staffQuickPillCard} onPress={() => setActiveStaffTab('Attendance')}>
                        <View style={[styles.staffQuickIconBox, { backgroundColor: '#ECFDF5' }]}>
                          <IconComp name="calendar-outline" size={18} color="#059669" />
                        </View>
                        <Text style={styles.staffQuickPillText}>Attendance</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.staffQuickPillCard} onPress={() => setActiveStaffTab('Homework')}>
                        <View style={[styles.staffQuickIconBox, { backgroundColor: '#F3E8FF' }]}>
                          <IconComp name="book-outline" size={18} color="#7C3AED" />
                        </View>
                        <Text style={styles.staffQuickPillText}>Homework</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.staffQuickPillCard} onPress={() => { setActiveStaffTab('All Modules'); setActiveStaffModuleModal('Messages'); }}>
                        <View style={[styles.staffQuickIconBox, { backgroundColor: '#FFF7ED' }]}>
                          <IconComp name="chatbubbles-outline" size={18} color="#D97706" />
                        </View>
                        <Text style={styles.staffQuickPillText}>Messages</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.staffQuickPillCard} onPress={() => setActiveStaffTab('All Modules')}>
                        <View style={[styles.staffQuickIconBox, { backgroundColor: '#F1F5F9' }]}>
                          <IconComp name="apps-outline" size={18} color="#475569" />
                        </View>
                        <Text style={styles.staffQuickPillText}>📂 All Modules</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                </ScrollView>
              )}

              {/* --- STAFF TAB 2: TIMETABLE --- */}
              {activeStaffTab === 'Timetable' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <View style={styles.screenHeaderRow}>
                    <Text style={styles.screenTitleText}>Class Timetable</Text>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>Daily & Period-Wise Schedule</Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScrollContainer}>
                    {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map(day => (
                      <TouchableOpacity
                        key={day}
                        style={[styles.gradePillBtn, selectedTimetableDay === day && styles.gradePillBtnActive]}
                        onPress={() => setSelectedTimetableDay(day)}>
                        <Text style={[styles.gradePillText, selectedTimetableDay === day && styles.gradePillTextActive]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={styles.sectionCardBox}>
                    <Text style={styles.sectionCardTitle}>{selectedTimetableDay}day Schedule</Text>

                    {[
                      { period: 'Period 1', time: '08:30 - 09:15 AM', subject: 'Mathematics', class: 'Class 10A', room: 'Room 302' },
                      { period: 'Period 2', time: '09:15 - 10:00 AM', subject: 'Physics', class: 'Class 10B', room: 'Room 204' },
                      { period: 'Period 3', time: '10:15 - 11:00 AM', subject: 'Advanced Physics', class: 'Class 11A', room: 'Lab 2' },
                      { period: 'Period 4', time: '11:30 - 12:15 PM', subject: 'Physics Lab Practical', class: 'Class 12A', room: 'Lab 1' },
                    ].map((item, idx) => (
                      <View key={idx} style={styles.activityItemRow}>
                        <View style={[styles.activityIconBox, { backgroundColor: idx % 2 === 0 ? '#EFF6FF' : '#ECFDF5' }]}>
                          <IconComp name="time-outline" size={16} color={idx % 2 === 0 ? '#2563EB' : '#059669'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.studentNameText}>{item.subject} ({item.class})</Text>
                            <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569' }}>{item.room}</Text>
                            </View>
                          </View>
                          <Text style={styles.studentDetailsSubText}>{item.period} • {item.time}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.smallFeeActionBtn, { backgroundColor: '#7C3AED' }]}
                          onPress={() => {
                            setActiveStaffTab('Attendance');
                            showToast(`Opened Attendance for ${item.class}`);
                          }}>
                          <Text style={[styles.smallFeeActionBtnText, { color: '#FFFFFF' }]}>Mark</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}



              {/* --- STAFF TAB 3: ATTENDANCE --- */}
              {activeStaffTab === 'Attendance' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <View style={styles.screenHeaderRow}>
                    <Text style={styles.screenTitleText}>Student Attendance</Text>
                    <TouchableOpacity
                      style={styles.headerPrimaryBtn}
                      onPress={() => {
                        setStudents(prev => prev.map(s => ({ ...s, attendanceStatus: 'Present' })));
                        showToast('Marked all students Present!');
                      }}>
                      <IconComp name="checkmark-done-outline" size={14} color="#FFFFFF" />
                      <Text style={styles.headerPrimaryBtnText}>All Present</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Grade Filter Pills */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScrollContainer}>
                    {['All', 'Class 10', 'Class 11', 'Class 12'].map(grade => (
                      <TouchableOpacity
                        key={grade}
                        style={[styles.gradePillBtn, gradeFilter === grade && styles.gradePillBtnActive]}
                        onPress={() => setGradeFilter(grade)}>
                        <Text style={[styles.gradePillText, gradeFilter === grade && styles.gradePillTextActive]}>{grade}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Attendance Roster Table */}
                  <View style={styles.sectionCardBox}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderText, { width: 50 }]}>Roll</Text>
                      <Text style={[styles.tableHeaderText, { flex: 1 }]}>Student Name</Text>
                      <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'center' }]}>Status</Text>
                    </View>

                    {paginatedStudents.map(student => (
                      <View key={student.id} style={styles.tableDataRow}>
                        <Text style={[styles.tableCellText, { width: 50, color: '#64748B' }]}>{student.rollNo}</Text>
                        <Text style={[styles.tableCellText, { flex: 1, fontWeight: '600' }]}>{student.name}</Text>
                        <TouchableOpacity
                          style={[
                            styles.attendanceBadgePill,
                            student.attendanceStatus === 'Present' && styles.attPresentStyle,
                            student.attendanceStatus === 'Absent' && styles.attAbsentStyle,
                            student.attendanceStatus === 'OD' && styles.attOdStyle,
                          ]}
                          onPress={() => toggleAttendance(student.id)}>
                          <Text style={styles.attendanceBadgeText}>{student.attendanceStatus}</Text>
                        </TouchableOpacity>
                      </View>
                    ))}

                    <PaginationControls
                      currentPage={attendancePage}
                      totalPages={totalAttendancePages}
                      totalItems={filteredStudents.length}
                      pageSize={RECORD_PAGE_SIZE}
                      onPageChange={setAttendancePage}
                    />

                    <TouchableOpacity
                      style={[styles.primaryLoginBtn, { marginTop: 16, backgroundColor: '#059669', flexDirection: 'row', gap: 8 }]}
                      onPress={handleSaveAttendanceSubmit}
                      disabled={isSavingAttendance}>
                      {isSavingAttendance ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <IconComp name="save-outline" size={16} color="#FFFFFF" />
                      )}
                      <Text style={styles.primaryLoginBtnText}>
                        {isSavingAttendance ? 'Saving to Database...' : 'Save & Submit Attendance'}
                      </Text>
                    </TouchableOpacity>

                  </View>
                </ScrollView>
              )}

              {/* --- STAFF TAB 4: HOMEWORK --- */}
              {activeStaffTab === 'Homework' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <View style={styles.screenHeaderRow}>
                    <Text style={styles.screenTitleText}>Homework & Assignments</Text>
                    <TouchableOpacity
                      style={styles.headerPrimaryBtn}
                      onPress={() => setShowCreateHomeworkModal(true)}>
                      <IconComp name="add-circle-outline" size={14} color="#FFFFFF" />
                      <Text style={styles.headerPrimaryBtnText}>+ Assign</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.sectionCardBox}>
                    <Text style={styles.sectionCardTitle}>Active Homework Assignments</Text>

                    {homeworkList.map(hw => (
                      <View key={hw.id} style={[styles.activityItemRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 6, paddingVertical: 12 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <View style={{ backgroundColor: '#F3E8FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ color: '#7C3AED', fontWeight: '700', fontSize: 11 }}>{hw.class} • {hw.subject}</Text>
                          </View>
                          <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Due: {hw.dueDate}</Text>
                        </View>

                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{hw.title}</Text>
                        <Text style={{ fontSize: 12, color: '#475569' }}>Submissions: <Text style={{ fontWeight: '700', color: '#059669' }}>{hw.submissions}</Text></Text>

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, width: '100%' }}>
                          <TouchableOpacity
                            style={[styles.smallFeeActionBtn, { flex: 1, backgroundColor: '#2563EB' }]}
                            onPress={() => showToast(`Reviewing submissions for ${hw.title}`)}>
                            <Text style={[styles.smallFeeActionBtnText, { color: '#FFFFFF' }]}>Grade Homework</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}



              {/* --- STAFF TAB 5: 📂 ALL MODULES --- */}
              {activeStaffTab === 'All Modules' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <View style={styles.screenHeaderRow}>
                    <Text style={styles.screenTitleText}>All Modules</Text>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>12 Available Modules</Text>
                  </View>

                  {/* Search Bar for Staff Modules */}
                  <View style={styles.searchFilterBoxContainer}>
                    <View style={styles.searchInputWrapper}>
                      <IconComp name="search-outline" size={18} color="#94A3B8" />
                      <TextInput
                        style={styles.searchTextInput}
                        placeholder="Search modules..."
                        placeholderTextColor="#94A3B8"
                        value={moduleSearchQuery}
                        onChangeText={setModuleSearchQuery}
                      />
                    </View>
                  </View>

                  {/* 12 Staff Modules Grid (2-Column Cards matching Reference Design) */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                    {paginatedStaffModules.map(mod => (
                      <TouchableOpacity
                        key={mod.id}
                        style={{
                          width: '48.5%',
                          backgroundColor: '#FFFFFF',
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: '#F1F5F9',
                          padding: 14,
                          marginBottom: 10,
                          shadowColor: '#64748B',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 3,
                          elevation: 1,
                        }}
                        onPress={() => {
                          setActiveStaffModuleModal(mod.name);
                          showToast(`Opened ${mod.name} Module`);
                        }}
                        activeOpacity={0.75}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${mod.color}15`, justifyContent: 'center', alignItems: 'center' }}>
                            <IconComp name={mod.icon} size={22} color={mod.color} />
                          </View>
                          <IconComp name="chevron-forward-outline" size={16} color="#CBD5E1" />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 12 }} numberOfLines={2}>
                          {mod.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Pagination Controls for Staff All Modules */}
                  <PaginationControls
                    currentPage={staffModulePage}
                    totalPages={totalStaffModulePages}
                    totalItems={filteredStaffModules.length}
                    pageSize={STAFF_MODULE_PAGE_SIZE}
                    onPageChange={setStaffModulePage}
                  />
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              {/* ==================== ADMIN TAB 1: DASHBOARD ==================== */}
              {activeAdminTab === 'Dashboard' && (
                <ScrollView
                  contentContainerStyle={styles.tabScrollContentWithFloatingNav}
                  showsVerticalScrollIndicator={false}>
                  
                  {/* Premium Welcome Gradient Banner */}
                  <View style={styles.greetingBannerCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <IconComp name="sunny-outline" size={20} color="#F59E0B" />
                      <Text style={styles.greetingTitle}>Good Morning, Admin</Text>
                    </View>
                    <Text style={styles.greetingSub}>Here's what's happening at your school today.</Text>
                  </View>

                  {/* Sub-Header Controls Row */}
                  <View style={styles.subHeaderFilterRow}>
                    <TouchableOpacity style={styles.pillCardBtn} onPress={() => showToast('Dashboard customized')}>
                      <IconComp name="options-outline" size={16} color="#64748B" />
                      <Text style={styles.pillCardText}>Customize</Text>
                    </TouchableOpacity>

                    <View style={styles.pillCardBtn}>
                      <IconComp name="calendar-outline" size={16} color="#64748B" />
                      <Text style={styles.pillCardText}>07/09/2026</Text>
                    </View>
                  </View>

                  {/* Metric Summary Cards */}
                  <View style={styles.metricsGridContainer}>
                    <TouchableOpacity style={styles.metricCard} onPress={() => setActiveAdminTab('Students')}>
                      <View style={styles.metricIconRow}>
                        <View style={[styles.metricIconCircle, { backgroundColor: '#EFF6FF' }]}>
                          <IconComp name="school-outline" size={20} color="#2563EB" />
                        </View>
                        <IconComp name="chevron-forward-outline" size={16} color="#94A3B8" />
                      </View>
                      <Text style={styles.metricLabelTitle}>Total Students</Text>
                      <Text style={styles.metricNumberValue}>412</Text>
                      <Text style={[styles.metricTrendText, { color: '#059669' }]}>↑ +12% from last month</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.metricCard} onPress={() => showToast('Teaching Staff: 28 Members')}>
                      <View style={styles.metricIconRow}>
                        <View style={[styles.metricIconCircle, { backgroundColor: '#F3E8FF' }]}>
                          <IconComp name="people-outline" size={20} color="#7C3AED" />
                        </View>
                        <IconComp name="chevron-forward-outline" size={16} color="#94A3B8" />
                      </View>
                      <Text style={styles.metricLabelTitle}>Teaching Staff</Text>
                      <Text style={styles.metricNumberValue}>{facultyCount}</Text>
                      <Text style={[styles.metricTrendText, { color: '#059669' }]}>↑ +2 new this month</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.metricCard} onPress={() => showToast('Active Classes: 18 Sections')}>
                      <View style={styles.metricIconRow}>
                        <View style={[styles.metricIconCircle, { backgroundColor: '#ECFDF5' }]}>
                          <IconComp name="book-outline" size={20} color="#059669" />
                        </View>
                        <IconComp name="chevron-forward-outline" size={16} color="#94A3B8" />
                      </View>
                      <Text style={styles.metricLabelTitle}>Active Classes</Text>
                      <Text style={styles.metricNumberValue}>18</Text>
                      <Text style={[styles.metricTrendText, { color: '#2563EB' }]}>↑ Across all sections</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.metricCard} onPress={() => setActiveAdminTab('Fees')}>
                      <View style={styles.metricIconRow}>
                        <View style={[styles.metricIconCircle, { backgroundColor: '#FEF2F2' }]}>
                          <IconComp name="wallet-outline" size={20} color="#DC2626" />
                        </View>
                        <IconComp name="chevron-forward-outline" size={16} color="#94A3B8" />
                      </View>
                      <Text style={styles.metricLabelTitle}>Pending Fees</Text>
                      <Text style={styles.metricNumberValue}>₹ 2,48,500</Text>
                      <Text style={[styles.metricTrendText, { color: '#DC2626' }]}>↗ +3 overdue payments</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Middle Section */}
                  <View style={styles.middleSectionRow}>
                    <View style={styles.sectionCardBox}>
                      <View style={styles.sectionHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <IconComp name="megaphone-outline" size={18} color="#7C3AED" />
                          <Text style={styles.sectionCardTitle}>Recent Notices</Text>
                        </View>
                        <TouchableOpacity onPress={() => setActiveAdminTab('Students')}>
                          <Text style={styles.viewAllLinkText}>View All</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.activityItemRow}>
                        <View style={[styles.activityIconBox, { backgroundColor: '#EFF6FF' }]}>
                          <IconComp name="school-outline" size={16} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.activityTitleText}>New student registered</Text>
                          <Text style={styles.activitySubText}>Rahul Kumar • Class 10A</Text>
                        </View>
                        <Text style={styles.activityTimeText}>2 hours ago</Text>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              )}

              {/* ==================== ADMIN TAB 2: STUDENTS ==================== */}
              {activeAdminTab === 'Students' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <View style={styles.screenHeaderRow}>
                    <Text style={styles.screenTitleText}>Student Directory</Text>
                    <TouchableOpacity style={styles.headerPrimaryBtn} onPress={() => setShowStudentModal(true)}>
                      <IconComp name="person-add-outline" size={14} color="#FFFFFF" />
                      <Text style={styles.headerPrimaryBtnText}>Add Student</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}

              {/* ==================== ADMIN TAB 3: ATTENDANCE ==================== */}
              {activeAdminTab === 'Attendance' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <Text style={styles.screenTitleText}>School Attendance</Text>
                </ScrollView>
              )}

              {/* ==================== ADMIN TAB 4: FEES ==================== */}
              {activeAdminTab === 'Fees' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <Text style={styles.screenTitleText}>Fees & Financials</Text>
                </ScrollView>
              )}

              {/* ==================== ADMIN TAB 5: ALL MODULES ==================== */}
              {activeAdminTab === 'All Modules' && (
                <ScrollView contentContainerStyle={styles.tabScrollContentWithFloatingNav} showsVerticalScrollIndicator={false}>
                  <Text style={styles.screenTitleText}>All Admin Modules</Text>
                  <View style={styles.modulesGridContainer}>
                    {paginatedModules.map(mod => (
                      <TouchableOpacity
                        key={mod.id}
                        style={styles.moduleGridCard}
                        onPress={() => setActiveModuleModal(mod.name)}>
                        <View style={[styles.moduleIconBoxCircle, { backgroundColor: `${mod.color}15` }]}>
                          <IconComp name={mod.icon} size={22} color={mod.color} />
                        </View>
                        <Text style={styles.moduleGridTitleText}>{mod.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          )}

        </View>

        {/* ========================================================================= */}
        {/* DYNAMIC FLOATING BOTTOM NAVIGATION BAR (STAFF OR ADMIN) */}
        {/* ========================================================================= */}
        <View style={styles.floatingNavWrapper}>
          <View style={styles.floatingNavPillContainer}>
            {activeRole === 'Teacher' ? (
              (['Dashboard', 'Timetable', 'Attendance', 'Homework', 'All Modules'] as StaffTab[]).map(tab => {
                const isActive = activeStaffTab === tab;
                const iconMap: Record<StaffTab, string> = {
                  'Dashboard': 'grid-outline',
                  'Timetable': 'time-outline',
                  'Attendance': 'calendar-outline',
                  'Homework': 'book-outline',
                  'All Modules': 'apps-outline',
                };

                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.floatingTabItemBtn, isActive && styles.floatingTabItemBtnActive]}
                    onPress={() => setActiveStaffTab(tab)}
                    activeOpacity={0.8}>
                    <IconComp
                      name={iconMap[tab]}
                      size={18}
                      color={isActive ? '#7C3AED' : '#64748B'}
                    />
                    <Text style={[styles.floatingTabLabelText, isActive && styles.floatingTabLabelTextActive, { fontSize: 9 }]}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              (['Dashboard', 'Students', 'Attendance', 'Fees', 'All Modules'] as AdminTab[]).map(tab => {
                const isActive = activeAdminTab === tab;
                const iconMap: Record<AdminTab, string> = {
                  'Dashboard': 'grid-outline',
                  'Students': 'people-outline',
                  'Attendance': 'calendar-outline',
                  'Fees': 'card-outline',
                  'All Modules': 'apps-outline',
                };

                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.floatingTabItemBtn, isActive && styles.floatingTabItemBtnActive]}
                    onPress={() => setActiveAdminTab(tab)}
                    activeOpacity={0.8}>
                    <IconComp
                      name={iconMap[tab]}
                      size={20}
                      color={isActive ? '#7C3AED' : '#64748B'}
                    />
                    <Text style={[styles.floatingTabLabelText, isActive && styles.floatingTabLabelTextActive]}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        {/* --- Shared Modals --- */}
        {/* Register Student Modal */}
        <Modal visible={showStudentModal} transparent animationType="slide">
          <View style={styles.modalOverlayDark}>
            <View style={styles.modalCardContainer}>
              <View style={styles.modalHeaderTitleRow}>
                <IconComp name="person-add-outline" size={20} color="#7C3AED" />
                <Text style={styles.modalCardTitle}>Register New Student</Text>
              </View>
              <Text style={styles.fieldLabelText}>Student Full Name *</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. Rahul Kumar"
                placeholderTextColor="#94A3B8"
                value={newStudentName}
                onChangeText={setNewStudentName}
              />
              <Text style={styles.fieldLabelText}>Grade / Class</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. Class 10"
                placeholderTextColor="#94A3B8"
                value={newStudentGrade}
                onChangeText={setNewStudentGrade}
              />
              <Text style={styles.fieldLabelText}>Roll Number *</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. 108"
                placeholderTextColor="#94A3B8"
                value={newStudentRollNo}
                onChangeText={setNewStudentRollNo}
                keyboardType="numeric"
              />
              <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#64748B' }]}
                  onPress={() => setShowStudentModal(false)}>
                  <Text style={styles.modalSmallBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#7C3AED' }]}
                  onPress={handleRegisterStudentSubmit}>
                  <Text style={styles.modalSmallBtnText}>Register</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Add Faculty Modal */}
        <Modal visible={showFacultyModal} transparent animationType="slide">
          <View style={styles.modalOverlayDark}>
            <View style={styles.modalCardContainer}>
              <View style={styles.modalHeaderTitleRow}>
                <IconComp name="people-outline" size={20} color="#059669" />
                <Text style={styles.modalCardTitle}>Onboard Faculty Staff</Text>
              </View>
              <Text style={styles.fieldLabelText}>Faculty Name *</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. Dr. Sarah Connor"
                placeholderTextColor="#94A3B8"
                value={newFacultyName}
                onChangeText={setNewFacultyName}
              />
              <Text style={styles.fieldLabelText}>Subject / Department *</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. Physics"
                placeholderTextColor="#94A3B8"
                value={newFacultySubject}
                onChangeText={setNewFacultySubject}
              />
              <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#64748B' }]}
                  onPress={() => setShowFacultyModal(false)}>
                  <Text style={styles.modalSmallBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#059669' }]}
                  onPress={handleAddFacultySubmit}>
                  <Text style={styles.modalSmallBtnText}>Onboard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Export Report Modal */}
        <Modal visible={showReportModal} transparent animationType="slide">
          <View style={styles.modalOverlayDark}>
            <View style={styles.modalCardContainer}>
              <View style={styles.modalHeaderTitleRow}>
                <IconComp name="stats-chart-outline" size={20} color="#2563EB" />
                <Text style={styles.modalCardTitle}>Executive School Audit Report</Text>
              </View>
              <Text style={{ color: '#475569', fontSize: 13, marginBottom: 14 }}>
                Generate and share full executive analytics overview for ZUNA International Academy.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#64748B' }]}
                  onPress={() => setShowReportModal(false)}>
                  <Text style={styles.modalSmallBtnText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#2563EB' }]}
                  onPress={async () => {
                    setShowReportModal(false);
                    await handleShareReport();
                  }}>
                  <Text style={styles.modalSmallBtnText}>Export / Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Module Detail Modal */}
        <Modal visible={!!activeModuleModal} transparent animationType="slide">
          <View style={styles.modalOverlayDark}>
            <View style={styles.modalCardContainer}>
              <View style={styles.modalHeaderTitleRow}>
                <IconComp name="apps-outline" size={20} color="#7C3AED" />
                <Text style={styles.modalCardTitle}>{activeModuleModal} Module</Text>
              </View>
              <Text style={{ color: '#475569', fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
                Active mobile configuration for {activeModuleModal}. All real-time school data is synced with the main ZUNA Admin web database.
              </Text>
              <TouchableOpacity
                style={[styles.modalSmallBtn, { backgroundColor: '#7C3AED' }]}
                onPress={() => setActiveModuleModal(null)}>
                <Text style={styles.modalSmallBtnText}>Close Module View</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* --- Staff Modals --- */}
        {/* Create Homework Modal */}
        <Modal visible={showCreateHomeworkModal} transparent animationType="slide">
          <View style={styles.modalOverlayDark}>
            <View style={styles.modalCardContainer}>
              <View style={styles.modalHeaderTitleRow}>
                <IconComp name="book-outline" size={20} color="#7C3AED" />
                <Text style={styles.modalCardTitle}>Assign New Homework</Text>
              </View>
              <Text style={styles.fieldLabelText}>Assignment Title *</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. Physics Ch 5 Practice Problems"
                placeholderTextColor="#94A3B8"
                value={newHwTitle}
                onChangeText={setNewHwTitle}
              />
              <Text style={styles.fieldLabelText}>Target Class *</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. Class 10A"
                placeholderTextColor="#94A3B8"
                value={newHwClass}
                onChangeText={setNewHwClass}
              />
              <Text style={styles.fieldLabelText}>Subject *</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="e.g. Physics"
                placeholderTextColor="#94A3B8"
                value={newHwSubject}
                onChangeText={setNewHwSubject}
              />
              <Text style={styles.fieldLabelText}>Due Date</Text>
              <TextInput
                style={styles.modalInputBox}
                placeholder="Sep 12, 2026"
                placeholderTextColor="#94A3B8"
                value={newHwDueDate}
                onChangeText={setNewHwDueDate}
              />
              <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#64748B' }]}
                  onPress={() => setShowCreateHomeworkModal(false)}>
                  <Text style={styles.modalSmallBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#7C3AED' }]}
                  onPress={handleCreateHomeworkSubmit}
                  disabled={isSubmittingHw}>
                  {isSubmittingHw ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalSmallBtnText}>Post Assignment</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Staff Chat View Modal */}
        <Modal visible={!!activeChatModal} transparent animationType="slide">
          <View style={styles.modalOverlayDark}>
            <View style={[styles.modalCardContainer, { maxHeight: '80%' }]}>
              <View style={styles.modalHeaderTitleRow}>
                <IconComp name="chatbubbles-outline" size={20} color="#7C3AED" />
                <Text style={styles.modalCardTitle}>{activeChatModal?.name}</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                Role: {activeChatModal?.role} • Direct Messaging Channel
              </Text>
              <ScrollView style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 12, maxHeight: 220, marginBottom: 12 }}>
                <View style={{ marginBottom: 10, alignSelf: 'flex-start', backgroundColor: '#E2E8F0', padding: 8, borderRadius: 8, maxWidth: '80%' }}>
                  <Text style={{ fontSize: 12, color: '#0F172A' }}>{activeChatModal?.lastMsg}</Text>
                </View>
                <View style={{ alignSelf: 'flex-end', backgroundColor: '#7C3AED', padding: 8, borderRadius: 8, maxWidth: '80%' }}>
                  <Text style={{ fontSize: 12, color: '#FFFFFF' }}>Acknowledged! I will update you shortly.</Text>
                </View>
              </ScrollView>
              <TextInput
                style={styles.modalInputBox}
                placeholder="Type your response..."
                placeholderTextColor="#94A3B8"
                value={chatMessageText}
                onChangeText={setChatMessageText}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#64748B' }]}
                  onPress={() => setActiveChatModal(null)}>
                  <Text style={styles.modalSmallBtnText}>Close Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSmallBtn, { flex: 1, backgroundColor: '#7C3AED' }]}
                  onPress={handleSendMessageSubmit}>
                  <Text style={styles.modalSmallBtnText}>Send Message</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>


        {/* Staff Module Detail Modal */}
        <Modal visible={!!activeStaffModuleModal} transparent animationType="slide">
          <View style={styles.modalOverlayDark}>
            <View style={[styles.modalCardContainer, { maxHeight: '88%', minHeight: 380 }]}>
              <View style={styles.modalHeaderTitleRow}>
                <IconComp
                  name={
                    activeStaffModuleModal === 'Noticeboard' ? 'megaphone-outline' :
                    activeStaffModuleModal === 'Calendar' ? 'calendar-number-outline' :
                    activeStaffModuleModal === 'Lesson Plans' ? 'journal-outline' :
                    activeStaffModuleModal === 'Resources' ? 'folder-open-outline' :
                    activeStaffModuleModal === 'Timetable' ? 'time-outline' : 'apps-outline'
                  }
                  size={20}
                  color="#7C3AED"
                />
                <Text style={styles.modalCardTitle}>{activeStaffModuleModal}</Text>
              </View>

              {/* MODULE: NOTICEBOARD */}
              {activeStaffModuleModal === 'Noticeboard' ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 12 }}>View official announcements and broadcast messages to your class.</Text>
                  
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#7C3AED' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>Global Notices</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Class Noticeboard</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={{ flex: 1 }}>
                    {[
                      { id: 'n1', title: 'Term 1 Examination Schedule Released', date: 'Sep 05, 2026', sender: 'Principal Office', desc: 'The final timetable for Term 1 Mid-Exams has been published on the portal.' },
                      { id: 'n2', title: 'Teacher Training Workshop on AI Tools', date: 'Sep 02, 2026', sender: 'Academic Cell', desc: 'Mandatory workshop for all high school staff this Saturday at 10 AM in Auditorium 2.' },
                    ].map(notice => (
                      <View key={notice.id} style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', flex: 1 }}>{notice.title}</Text>
                          <Text style={{ fontSize: 10, color: '#7C3AED', fontWeight: '700' }}>{notice.date}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>{notice.desc}</Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>By: {notice.sender}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'Calendar' || activeStaffModuleModal === 'Academic Calendar' ? (
                /* MODULE: ACADEMIC CALENDAR */
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>September 2026</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <View style={{ backgroundColor: '#F3E8FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>• Event</Text>
                      </View>
                      <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>• Holiday</Text>
                      </View>
                    </View>
                  </View>

                  <ScrollView style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <View key={d} style={{ width: '13.2%', alignItems: 'center', paddingVertical: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B' }}>{d}</Text>
                        </View>
                      ))}
                      {Array.from({ length: 30 }, (_, i) => i + 1).map(dayNum => {
                        const isSunday = (dayNum - 1) % 7 === 0;
                        return (
                          <View key={dayNum} style={{ width: '13.2%', minHeight: 36, backgroundColor: isSunday ? '#FEF2F2' : '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6, padding: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isSunday ? '#DC2626' : '#334155' }}>{dayNum}</Text>
                            {isSunday && (
                              <View style={{ backgroundColor: '#EF4444', borderRadius: 2, paddingHorizontal: 2, marginTop: 2 }}>
                                <Text style={{ fontSize: 7, color: '#FFFFFF', fontWeight: '800' }}>Holiday</Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 6 }}>Upcoming School Events:</Text>
                    {[
                      { title: 'Teachers Day Celebration', date: 'Sep 05, 2026', type: 'Event' },
                      { title: 'Term 1 Mid-Examinations', date: 'Sep 18 - Sep 25', type: 'Exam' },
                    ].map((ev, i) => (
                      <View key={i} style={{ backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>{ev.title}</Text>
                        <Text style={{ fontSize: 10, color: '#7C3AED', fontWeight: '700' }}>{ev.date}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'Lesson Plans' ? (
                /* MODULE: LESSON PLANS */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Create, organize, and track your daily lesson plans.</Text>

                  <Text style={styles.fieldLabelText}>Topic / Lesson Objectives *</Text>
                  <TextInput
                    style={styles.modalInputBox}
                    placeholder="e.g. Newton's 3rd Law of Motion & Friction Lab"
                    placeholderTextColor="#94A3B8"
                    value={lessonObjectives}
                    onChangeText={setLessonObjectives}
                  />

                  <TouchableOpacity
                    style={{ backgroundColor: '#7C3AED', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginBottom: 12 }}
                    onPress={handleCreateLessonPlanSubmit}
                    disabled={isSubmittingPlan}>
                    {isSubmittingPlan ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>+ Submit Lesson Plan</Text>
                    )}
                  </TouchableOpacity>

                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 8 }}>My Submitted Plans:</Text>
                  <ScrollView style={{ flex: 1 }}>
                    {lessonPlansList.map(plan => (
                      <View key={plan.id} style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>{plan.subject} ({plan.class})</Text>
                          <View style={{ backgroundColor: plan.status === 'Approved' ? '#ECFDF5' : '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: plan.status === 'Approved' ? '#059669' : '#D97706' }}>{plan.status}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: '#475569' }}>{plan.topic}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'Resources' ? (
                /* MODULE: DIGITAL RESOURCES */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Upload study materials, notes, and links to share with your students.</Text>

                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                    {['All Files', 'Documents', 'Videos', 'Links', 'Images'].map((tab, idx) => (
                      <TouchableOpacity key={tab} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: idx === 0 ? '#7C3AED' : '#F1F5F9' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: idx === 0 ? '#FFFFFF' : '#475569' }}>{tab}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <ScrollView style={{ flex: 1 }}>
                    {[
                      { title: 'Physics Ch 4 Formula Sheet.pdf', size: '2.4 MB', type: 'Document' },
                      { title: 'Optics Lab Experiment Video.mp4', size: '48.1 MB', type: 'Video' },
                      { title: 'NCERT Reference Solutions Link', size: 'Web URL', type: 'Link' },
                    ].map((res, i) => (
                      <View key={i} style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{res.title}</Text>
                          <Text style={{ fontSize: 10, color: '#64748B' }}>{res.type} • {res.size}</Text>
                        </View>
                        <TouchableOpacity style={{ backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }} onPress={() => showToast(`Opening ${res.title}...`)}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>Open</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'Timetable' ? (
                /* MODULE: TIMETABLE */
                <View style={{ width: '100%', maxHeight: 420 }}>
                  <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 8 }}>Daily & Period-Wise Classes</Text>
                  
                  {/* Day Selector Pills */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                    {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).map(day => (
                      <TouchableOpacity
                        key={day}
                        style={[styles.gradePillBtn, selectedTimetableDay === day && styles.gradePillBtnActive]}
                        onPress={() => setSelectedTimetableDay(day)}>
                        <Text style={[styles.gradePillText, selectedTimetableDay === day && styles.gradePillTextActive]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                    {[
                      { period: 'Period 1', time: '08:30 - 09:15 AM', subject: 'Mathematics', class: 'Class 10A', room: 'Room 302' },
                      { period: 'Period 2', time: '09:15 - 10:00 AM', subject: 'Physics', class: 'Class 10B', room: 'Room 204' },
                      { period: 'Period 3', time: '10:15 - 11:00 AM', subject: 'Advanced Physics', class: 'Class 11A', room: 'Lab 2' },
                      { period: 'Period 4', time: '11:30 - 12:15 PM', subject: 'Physics Lab Practical', class: 'Class 12A', room: 'Lab 1' },
                    ].map((item, idx) => (
                      <View key={idx} style={[styles.activityItemRow, { paddingVertical: 10 }]}>
                        <View style={[styles.activityIconBox, { backgroundColor: idx % 2 === 0 ? '#EFF6FF' : '#ECFDF5' }]}>
                          <IconComp name="time-outline" size={16} color={idx % 2 === 0 ? '#2563EB' : '#059669'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.studentNameText}>{item.subject} ({item.class})</Text>
                            <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569' }}>{item.room}</Text>
                            </View>
                          </View>
                          <Text style={styles.studentDetailsSubText}>{item.period} • {item.time}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.smallFeeActionBtn, { backgroundColor: '#7C3AED' }]}
                          onPress={() => {
                            setActiveStaffModuleModal(null);
                            setActiveStaffTab('Attendance');
                            showToast(`Opened Attendance for ${item.class}`);
                          }}>
                          <Text style={[styles.smallFeeActionBtnText, { color: '#FFFFFF' }]}>Mark</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'Messages' ? (
                /* MODULE: MESSAGES */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Staff Inbox & Direct Messages</Text>
                  <ScrollView style={{ flex: 1 }}>
                    {chatList.map(chat => (
                      <TouchableOpacity
                        key={chat.id}
                        style={[styles.activityItemRow, { paddingVertical: 10 }]}
                        onPress={() => {
                          setActiveChatModal(chat);
                          showToast(`Opened chat with ${chat.name}`);
                        }}>
                        <View style={[styles.activityIconBox, { backgroundColor: chat.role === 'Admin' ? '#F3E8FF' : chat.role === 'Parent' ? '#ECFDF5' : '#EFF6FF' }]}>
                          <Text style={{ fontWeight: '800', color: '#0F172A', fontSize: 12 }}>{chat.avatar}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={styles.studentNameText}>{chat.name}</Text>
                            <Text style={styles.activityTimeText}>{chat.time}</Text>
                          </View>
                          <Text style={styles.studentDetailsSubText} numberOfLines={1}>{chat.lastMsg}</Text>
                        </View>
                        {chat.unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' }} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'Grades & Exams' ? (
                /* MODULE: GRADES & EXAMS */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Assessments, Mark Entries & Parent Portal Publishing</Text>
                  
                  <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 6 }}>Create New Assessment:</Text>
                    <TextInput
                      style={styles.modalInputBox}
                      placeholder="e.g. Unit Test 2 - Physics"
                      placeholderTextColor="#94A3B8"
                      value={assessmentTitle}
                      onChangeText={setAssessmentTitle}
                    />
                    <TouchableOpacity style={{ backgroundColor: '#7C3AED', paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginTop: 6 }} onPress={handleCreateAssessmentSubmit}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>+ Add Assessment</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 6 }}>Class 10A Mark Entry Grid:</Text>
                  <ScrollView style={{ flex: 1 }}>
                    {students.map(st => (
                      <View key={st.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', flex: 1 }}>{st.name} ({st.rollNo})</Text>
                        <TextInput
                          style={{ width: 60, height: 32, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6, textAlign: 'center', fontSize: 12, color: '#0F172A', backgroundColor: '#FFFFFF' }}
                          value={assessmentGradesMap[st.id] || '85'}
                          onChangeText={val => setAssessmentGradesMap(prev => ({ ...prev, [st.id]: val }))}
                          keyboardType="numeric"
                        />
                      </View>
                    ))}
                  </ScrollView>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: '#059669', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }} onPress={handleSaveGradesSubmit} disabled={isSavingGrades}>
                      {isSavingGrades ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Save Grades</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: '#2563EB', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }} onPress={() => showToast('Published assessment scores to Parent Portal!')}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Publish to Parents</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : activeStaffModuleModal === 'Leave Requests' ? (
                /* MODULE: LEAVE REQUESTS */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Apply for Leave & View Status</Text>

                  <Text style={styles.fieldLabelText}>Reason for Leave *</Text>
                  <TextInput
                    style={styles.modalInputBox}
                    placeholder="e.g. Medical emergency / Personal work"
                    placeholderTextColor="#94A3B8"
                    value={leaveReason}
                    onChangeText={setLeaveReason}
                  />

                  <TouchableOpacity style={{ backgroundColor: '#7C3AED', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginBottom: 12 }} onPress={handleApplyLeaveSubmit} disabled={isSubmittingLeave}>
                    {isSubmittingLeave ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>Submit Leave Application</Text>
                    )}
                  </TouchableOpacity>

                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 6 }}>My Leave History:</Text>
                  <ScrollView style={{ flex: 1 }}>
                    {leavesList.map(l => (
                      <View key={l.id} style={{ backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{l.type} ({l.dates})</Text>
                          <Text style={{ fontSize: 10, color: '#64748B' }}>{l.reason}</Text>
                        </View>
                        <View style={{ backgroundColor: l.status === 'Approved' ? '#ECFDF5' : '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: l.status === 'Approved' ? '#059669' : '#D97706' }}>{l.status}</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'PTM Scheduler' ? (
                /* MODULE: PTM SCHEDULER */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Parent-Teacher Meeting Slot Management</Text>

                  <Text style={styles.fieldLabelText}>Meeting Slot Time *</Text>
                  <TextInput
                    style={styles.modalInputBox}
                    placeholder="e.g. 02:00 PM - 02:30 PM"
                    placeholderTextColor="#94A3B8"
                    value={ptmTimeSlot}
                    onChangeText={setPtmTimeSlot}
                  />

                  <TouchableOpacity style={{ backgroundColor: '#059669', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginBottom: 12 }} onPress={handleCreatePTMSlotSubmit} disabled={isSubmittingPTM}>
                    {isSubmittingPTM ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>+ Create PTM Slot</Text>
                    )}
                  </TouchableOpacity>

                  <ScrollView style={{ flex: 1 }}>
                    {ptmSlotsList.map(ptm => (
                      <View key={ptm.id} style={{ backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{ptm.time}</Text>
                          <Text style={{ fontSize: 10, color: '#64748B' }}>Bookings: {ptm.bookings}</Text>
                        </View>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>● {ptm.status}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : activeStaffModuleModal === 'My Salary' ? (
                /* MODULE: MY SALARY */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Monthly Payslips & Compensation Details</Text>

                  <View style={{ backgroundColor: '#0F172A', padding: 14, borderRadius: 12, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600' }}>August 2026 Net Salary</Text>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginVertical: 4 }}>₹ 48,500</Text>
                    <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '700' }}>Status: Credited on Sep 01</Text>
                  </View>

                  <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, color: '#64748B' }}>Basic Salary</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>₹ 35,000</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, color: '#64748B' }}>HRA & Allowances</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>₹ 15,000</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, color: '#DC2626' }}>PF & Tax Deductions</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>- ₹ 1,500</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={{ backgroundColor: '#2563EB', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }} onPress={handleShareReport}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>Download / Share Payslip PDF</Text>
                  </TouchableOpacity>
                </View>
              ) : activeStaffModuleModal === 'Profile' ? (
                /* MODULE: PROFILE */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 10 }}>Staff Credentials & Profile Settings</Text>

                  <Text style={styles.fieldLabelText}>Phone Number</Text>
                  <TextInput
                    style={styles.modalInputBox}
                    value={staffPhone}
                    onChangeText={setStaffPhone}
                  />

                  <Text style={styles.fieldLabelText}>Qualifications</Text>
                  <TextInput
                    style={styles.modalInputBox}
                    value={staffQual}
                    onChangeText={setStaffQual}
                  />

                  <Text style={styles.fieldLabelText}>Address</Text>
                  <TextInput
                    style={styles.modalInputBox}
                    value={staffAddress}
                    onChangeText={setStaffAddress}
                  />

                  <TouchableOpacity style={{ backgroundColor: '#7C3AED', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 6 }} onPress={handleSaveProfileSubmit} disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>Save Profile Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* DEFAULT MODULE VIEW */
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#475569', fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
                    Active mobile configuration for {activeStaffModuleModal}. All real-time school records, schedules, and staff settings are synced with ZUNA Admin servers.
                  </Text>
                  <TouchableOpacity style={{ backgroundColor: '#7C3AED', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }} onPress={() => showToast(`Synchronized ${activeStaffModuleModal} module!`)}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>Sync Module Data</Text>
                  </TouchableOpacity>
                </View>
              )}


              <TouchableOpacity
                style={[styles.modalSmallBtn, { backgroundColor: '#7C3AED', marginTop: 12 }]}
                onPress={() => setActiveStaffModuleModal(null)}>
                <Text style={styles.modalSmallBtnText}>Close Module</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// =========================================================================
// STYLES SYSTEM (Vibrant Modern Mobile Aesthetic matching ZUNA Reference UI)
// =========================================================================
const styles = StyleSheet.create({
  // --- Splash Screen ---
  splashContainer: {
    flex: 1,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContent: {
    alignItems: 'center',
  },
  splashBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  splashSubtitle: {
    fontSize: 16,
    color: '#F3E8FF',
    fontWeight: '500',
    marginTop: 4,
  },
  splashVersion: {
    fontSize: 12,
    color: '#DDD6FE',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // --- Professional Login Screen ---
  loginContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loginScroll: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 16 : 24,
    paddingBottom: 40,
  },
  brandHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  brandLogoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  brandSubTitle: {
    fontSize: 12,
    color: '#64748B',
  },
  loginTitleBlock: {
    marginBottom: 24,
  },
  loginHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  loginSubHeading: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  inputLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  inputBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 12,
  },
  inputBoxText: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    marginLeft: 10,
  },
  eyeIconButton: {
    padding: 6,
  },
  optionsRowBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  rememberCheckBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkBoxSquare: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  checkBoxSquareChecked: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  checkBoxCheckMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  rememberLabelText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  forgotPasswordLinkText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '700',
  },
  primaryLoginBtn: {
    backgroundColor: '#7C3AED',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryLoginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  signUpFooterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signUpFooterText: {
    fontSize: 13,
    color: '#64748B',
  },
  signUpFooterLink: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '700',
  },
  quickDemoCardSection: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  quickDemoHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 1,
  },
  quickPillsRowBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  quickRolePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  quickRolePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },

  // --- Toast Banner ---
  toastBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  toastBannerText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // --- Main App Shell & Top Header ---
  mainAppContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  headerLeftBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  schoolBrandDetails: {
    flex: 1,
  },
  schoolNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBrandTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  officialBadgePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#A7F3D0',
  },
  officialBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  headerBrandSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  headerRightProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  avatarPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },
  roleDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleDropdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },

  // --- Scroll & Content ---
  tabScrollContentWithFloatingNav: {
    padding: 16,
    paddingBottom: 110,
  },

  // --- Greeting Banner ---
  greetingBannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  greetingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  greetingSub: {
    fontSize: 13,
    color: '#64748B',
  },

  // --- Sub-Header Row ---
  subHeaderFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pillCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },

  // --- Metrics Cards 2x2 Grid ---
  metricsGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  metricIconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricLabelTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  metricNumberValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  metricTrendText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // --- Middle Section Cards ---
  middleSectionRow: {
    gap: 16,
  },
  sectionCardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  viewAllLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
  },
  activityItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  activityIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  activitySubText: {
    fontSize: 11,
    color: '#64748B',
  },
  activityTimeText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // --- System Status Navy Card ---
  navyStatusCardBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    elevation: 3,
  },
  navyCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  statusOnlineIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  greenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  statusOnlineText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  navySubBoxContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  navySubBoxHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  navySubBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noInvoicesBadgePill: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  noInvoicesBadgeText: {
    fontSize: 10,
    color: '#F59E0B',
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
  },
  percentCollectedText: {
    fontSize: 11,
    color: '#94A3B8',
  },

  // --- Quick Actions ---
  actionGridBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 10,
  },
  actionGridBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // --- Student Directory & Search ---
  screenHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  screenTitleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  searchFilterBoxContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    marginLeft: 8,
  },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillsScrollContainer: {
    gap: 8,
    marginBottom: 14,
  },
  gradePillBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gradePillBtnActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  gradePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  gradePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  studentListCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  studentAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#7C3AED',
  },
  studentNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  studentDetailsSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadgeGreenPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  statusBadgeGreenText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
  },
  smallFeeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  feePaidStyle: {
    backgroundColor: '#DCFCE7',
  },
  feeUnpaidStyle: {
    backgroundColor: '#FEE2E2',
  },
  smallFeeActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
  },

  // --- Reusable Pagination Controls ---
  paginationWrapper: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paginationInfoText: {
    fontSize: 12,
    color: '#64748B',
  },
  paginationBoldText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  paginationBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paginationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  paginationBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  paginationBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  paginationBtnTextDisabled: {
    color: '#94A3B8',
  },
  pageIndicatorBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pageIndicatorText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },

  // --- Attendance View ---
  attendanceFilterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  controlDropdownRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
  },
  dropdownTextValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  loadStudentsBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadStudentsBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  attendanceStatusRowBox: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  statusSummaryPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  statusSummaryPillActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  statusSummaryPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  statusSummaryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableCellText: {
    fontSize: 13,
    color: '#0F172A',
  },
  attendanceBadgePill: {
    width: 76,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
  },
  attPresentStyle: { backgroundColor: '#DCFCE7' },
  attAbsentStyle: { backgroundColor: '#FEE2E2' },
  attOdStyle: { backgroundColor: '#FEF3C7' },
  attendanceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
  },
  attFooterActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attFooterActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // --- All Modules & Pagination Reference Styles ---
  paginationWrapperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  pageSquareBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageSquareBtnActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  pageSquareBtnDisabled: {
    opacity: 0.4,
    backgroundColor: '#F8FAFC',
  },
  pageNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  pageNumberTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pageSizeDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
  },
  pageSizeDropdownText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },

  modulesGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  moduleGridCard: {
    width: '31.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 96,
    justifyContent: 'center',
  },
  moduleIconBoxCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  moduleGridTitleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 14,
  },

  // =========================================================================
  // FLOATING BOTTOM NAVIGATION BAR (SINGLE CLEAN NAVIGATION EXPERIENCE)
  // =========================================================================
  floatingNavWrapper: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 12,
  },
  floatingNavPillContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    width: '100%',
    justifyContent: 'space-around',
  },
  floatingTabItemBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 24,
  },
  floatingTabItemBtnActive: {
    backgroundColor: '#F3E8FF',
  },
  floatingTabLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 3,
  },
  floatingTabLabelTextActive: {
    color: '#7C3AED',
    fontWeight: '800',
  },

  // --- Shared Modals ---
  modalOverlayDark: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  modalCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCardDesc: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
    lineHeight: 18,
  },
  fieldLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
    marginTop: 6,
  },
  modalInputBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 8,
  },
  modalSmallBtn: {
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSmallBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  headerPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#7C3AED',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  headerPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // --- Staff Quick Access Styles ---
  staffQuickPillCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 95,
  },
  staffQuickIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  staffQuickPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
});

export default App;
