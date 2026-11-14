/**
 * The app's icons: Phosphor, in its duotone weight (a crisp line over a soft tint of the same colour).
 * Exported under the names the app already used, so every screen switched at once. Small UI glyphs
 * (chevrons, close, check, spinners) stay regular weight. Brand logos are not icons; see PlatformLogo.
 */
import { forwardRef, type ComponentType } from "react";
import {
  ArrowCounterClockwise as PhArrowCounterClockwise,
  ArrowDownRight as PhArrowDownRight,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowSquareOut as PhArrowSquareOut,
  ArrowUp as PhArrowUp,
  ArrowUpRight as PhArrowUpRight,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowsSplit as PhArrowsSplit,
  Bell as PhBell,
  BellRinging as PhBellRinging,
  BookOpen as PhBookOpen,
  BookOpenText as PhBookOpenText,
  Brain as PhBrain,
  Briefcase as PhBriefcase,
  Broadcast as PhBroadcast,
  Buildings as PhBuildings,
  Calculator as PhCalculator,
  CalendarBlank as PhCalendarBlank,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  CaretUpDown as PhCaretUpDown,
  ChartBar as PhChartBar,
  ChatCircleDots as PhChatCircleDots,
  ChatCircleText as PhChatCircleText,
  ChatText as PhChatText,
  ChatsCircle as PhChatsCircle,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  Circle as PhCircle,
  CircleDashed as PhCircleDashed,
  CircleNotch as PhCircleNotch,
  ClipboardText as PhClipboardText,
  Clock as PhClock,
  Coins as PhCoins,
  Compass as PhCompass,
  Copy as PhCopy,
  CurrencyCircleDollar as PhCurrencyCircleDollar,
  CursorClick as PhCursorClick,
  DotsThree as PhDotsThree,
  DotsThreeVertical as PhDotsThreeVertical,
  DownloadSimple as PhDownloadSimple,
  Eye as PhEye,
  FileCsv as PhFileCsv,
  FileImage as PhFileImage,
  FileMagnifyingGlass as PhFileMagnifyingGlass,
  FileText as PhFileText,
  FilmSlate as PhFilmSlate,
  FloppyDisk as PhFloppyDisk,
  Folder as PhFolder,
  FolderOpen as PhFolderOpen,
  Footprints as PhFootprints,
  Gauge as PhGauge,
  Gear as PhGear,
  Globe as PhGlobe,
  Hand as PhHand,
  Hourglass as PhHourglass,
  House as PhHouse,
  Kanban as PhKanban,
  Newspaper as PhNewspaper,
  Info as PhInfo,
  Lightbulb as PhLightbulb,
  Lightning as PhLightning,
  Link as PhLink,
  LinkSimple as PhLinkSimple,
  List as PhList,
  ListChecks as PhListChecks,
  ListDashes as PhListDashes,
  EnvelopeSimple as PhEnvelopeSimple,
  Lock as PhLock,
  MagnifyingGlass as PhMagnifyingGlass,
  MegaphoneSimple as PhMegaphone,
  MagnifyingGlassMinus as PhMagnifyingGlassMinus,
  MapPin as PhMapPin,
  Minus as PhMinus,
  MinusCircle as PhMinusCircle,
  Moon as PhMoon,
  NotePencil as PhNotePencil,
  Package as PhPackage,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Paperclip as PhPaperclip,
  PencilLine as PhPencilLine,
  Play as PhPlay,
  PlayCircle as PhPlayCircle,
  Plug as PhPlug,
  Plugs as PhPlugs,
  PlugsConnected as PhPlugsConnected,
  Plus as PhPlus,
  Prohibit as PhProhibit,
  Pulse as PhPulse,
  Question as PhQuestion,
  RadioButton as PhRadioButton,
  Robot as PhRobot,
  RocketLaunch as PhRocketLaunch,
  Scales as PhScales,
  Scroll as PhScroll,
  Shield as PhShield,
  ShieldCheck as PhShieldCheck,
  SidebarSimple as PhSidebarSimple,
  SlidersHorizontal as PhSlidersHorizontal,
  Sparkle as PhSparkle,
  SpinnerGap as PhSpinnerGap,
  Square as PhSquare,
  Microphone as PhMicrophone,
  SquaresFour as PhSquaresFour,
  Storefront as PhStorefront,
  Sun as PhSun,
  Target as PhTarget,
  Trash as PhTrash,
  TrendUp as PhTrendUp,
  UploadSimple as PhUploadSimple,
  User as PhUser,
  UserMinus as PhUserMinus,
  Users as PhUsers,
  Palette as PhPalette,
  Quotes as PhQuotes,
  Wallet as PhWallet,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  WifiSlash as PhWifiSlash,
  Wrench as PhWrench,
  X as PhX,
  XCircle as PhXCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon, IconProps } from "@phosphor-icons/react";

/** Props the app passes, kept compatible with what Lucide accepted. */
export type IconComponentProps = IconProps & { strokeWidth?: number | string; absoluteStrokeWidth?: boolean };
/** Kept for type positions that named the old icon type. */
export type LucideIcon = ComponentType<IconComponentProps>;

function wrap(Base: Icon, name: string, duotone: boolean): LucideIcon {
  const Wrapped = forwardRef<SVGSVGElement, IconComponentProps>(function Wrapped({ strokeWidth, absoluteStrokeWidth: _absolute, weight, ...props }, ref) {
    void _absolute;
    return <Base ref={ref} weight={weight ?? (duotone && strokeWidth === undefined ? "duotone" : "regular")} {...props} />;
  });
  Wrapped.displayName = name;
  return Wrapped as unknown as LucideIcon;
}

export const Activity = wrap(PhPulse, "Activity", true);
export const AlertTriangle = wrap(PhWarning, "AlertTriangle", true);
export const ArrowDownRight = wrap(PhArrowDownRight, "ArrowDownRight", false);
export const ArrowLeft = wrap(PhArrowLeft, "ArrowLeft", false);
export const ArrowRight = wrap(PhArrowRight, "ArrowRight", false);
export const ArrowUp = wrap(PhArrowUp, "ArrowUp", false);
export const ArrowUpRight = wrap(PhArrowUpRight, "ArrowUpRight", false);
export const BarChart3 = wrap(PhChartBar, "BarChart3", true);
export const Bell = wrap(PhBell, "Bell", true);
export const BellRing = wrap(PhBellRinging, "BellRing", true);
export const BookOpen = wrap(PhBookOpen, "BookOpen", true);
export const BookOpenCheck = wrap(PhBookOpenText, "BookOpenCheck", true);
export const BotIcon = wrap(PhRobot, "BotIcon", true);
export const Brain = wrap(PhBrain, "Brain", true);
export const Palette = wrap(PhPalette, "Palette", true);
export const Quote = wrap(PhQuotes, "Quote", false);
export const BriefcaseBusiness = wrap(PhBriefcase, "BriefcaseBusiness", true);
export const Building2 = wrap(PhBuildings, "Building2", true);
export const Cable = wrap(PhPlug, "Cable", true);
export const Calculator = wrap(PhCalculator, "Calculator", true);
export const CalculatorIcon = wrap(PhCalculator, "CalculatorIcon", true);
export const CalendarIcon = wrap(PhCalendarBlank, "CalendarIcon", true);
export const Check = wrap(PhCheck, "Check", false);
export const CheckCircle2 = wrap(PhCheckCircle, "CheckCircle2", true);
export const ChevronDown = wrap(PhCaretDown, "ChevronDown", false);
export const ChevronDownIcon = wrap(PhCaretDown, "ChevronDownIcon", false);
export const ChevronLeft = wrap(PhCaretLeft, "ChevronLeft", false);
export const ChevronLeftIcon = wrap(PhCaretLeft, "ChevronLeftIcon", false);
export const ChevronRight = wrap(PhCaretRight, "ChevronRight", false);
export const ChevronRightIcon = wrap(PhCaretRight, "ChevronRightIcon", false);
export const ChevronUpIcon = wrap(PhCaretUp, "ChevronUpIcon", false);
export const ChevronsUpDownIcon = wrap(PhCaretUpDown, "ChevronsUpDownIcon", false);
export const Circle = wrap(PhCircle, "Circle", false);
export const CircleAlertIcon = wrap(PhWarningCircle, "CircleAlertIcon", true);
export const CircleCheckIcon = wrap(PhCheckCircle, "CircleCheckIcon", true);
export const CircleDashed = wrap(PhCircleDashed, "CircleDashed", false);
export const CircleDollarSign = wrap(PhCurrencyCircleDollar, "CircleDollarSign", true);
export const CircleDot = wrap(PhRadioButton, "CircleDot", true);
export const CircleHelp = wrap(PhQuestion, "CircleHelp", true);
export const CircleSlash = wrap(PhProhibit, "CircleSlash", true);
export const CircleXIcon = wrap(PhXCircle, "CircleXIcon", true);
export const Clapperboard = wrap(PhFilmSlate, "Clapperboard", true);
export const ClipboardList = wrap(PhClipboardText, "ClipboardList", true);
export const Clock = wrap(PhClock, "Clock", true);
export const Clock3 = wrap(PhClock, "Clock3", true);
export const Coins = wrap(PhCoins, "Coins", true);
export const Compass = wrap(PhCompass, "Compass", true);
export const CompassIcon = wrap(PhCompass, "CompassIcon", true);
export const Copy = wrap(PhCopy, "Copy", true);
export const Download = wrap(PhDownloadSimple, "Download", true);
export const EllipsisVertical = wrap(PhDotsThreeVertical, "EllipsisVertical", false);
export const ExternalLink = wrap(PhArrowSquareOut, "ExternalLink", true);
export const Eye = wrap(PhEye, "Eye", true);
export const FileImage = wrap(PhFileImage, "FileImage", true);
export const FileSearch = wrap(PhFileMagnifyingGlass, "FileSearch", true);
export const FileSearchIcon = wrap(PhFileMagnifyingGlass, "FileSearchIcon", true);
export const FileSpreadsheet = wrap(PhFileCsv, "FileSpreadsheet", true);
export const FileText = wrap(PhFileText, "FileText", true);
export const FileTextIcon = wrap(PhFileText, "FileTextIcon", true);
export const FolderClosed = wrap(PhFolder, "FolderClosed", true);
export const FolderOpen = wrap(PhFolderOpen, "FolderOpen", true);
export const Footprints = wrap(PhFootprints, "Footprints", true);
export const Gauge = wrap(PhGauge, "Gauge", true);
export const Globe = wrap(PhGlobe, "Globe", true);
export const Hand = wrap(PhHand, "Hand", true);
export const Hourglass = wrap(PhHourglass, "Hourglass", true);
export const Info = wrap(PhInfo, "Info", true);
export const InfoIcon = wrap(PhInfo, "InfoIcon", true);
export const Home = wrap(PhHouse, "Home", true);
export const Kanban = wrap(PhKanban, "Kanban", true);
export const LayoutGrid = wrap(PhSquaresFour, "LayoutGrid", true);
export const Newspaper = wrap(PhNewspaper, "Newspaper", true);
export const LayoutList = wrap(PhListDashes, "LayoutList", true);
export const LayoutListIcon = wrap(PhListDashes, "LayoutListIcon", true);
export const Lightbulb = wrap(PhLightbulb, "Lightbulb", true);
export const Link2 = wrap(PhLinkSimple, "Link2", false);
export const LinkIcon = wrap(PhLink, "LinkIcon", false);
export const ListChecks = wrap(PhListChecks, "ListChecks", true);
export const Loader = wrap(PhSpinnerGap, "Loader", false);
export const Loader2 = wrap(PhCircleNotch, "Loader2", false);
export const Loader2Icon = wrap(PhCircleNotch, "Loader2Icon", false);
export const LoaderCircle = wrap(PhCircleNotch, "LoaderCircle", false);
export const LoaderCircleIcon = wrap(PhCircleNotch, "LoaderCircleIcon", false);
export const Lock = wrap(PhLock, "Lock", true);
export const Mail = wrap(PhEnvelopeSimple, "Mail", true);
export const MapPin = wrap(PhMapPin, "MapPin", true);
export const Menu = wrap(PhList, "Menu", false);
export const MenuIcon = wrap(PhList, "MenuIcon", false);
export const MessageCircleQuestion = wrap(PhChatCircleDots, "MessageCircleQuestion", true);
export const MessageSquareText = wrap(PhChatText, "MessageSquareText", true);
export const MessageSquareWarning = wrap(PhChatCircleText, "MessageSquareWarning", true);
export const Megaphone = wrap(PhMegaphone, "Megaphone", true);
export const MessagesSquare = wrap(PhChatsCircle, "MessagesSquare", true);
export const Minus = wrap(PhMinus, "Minus", false);
export const MinusCircle = wrap(PhMinusCircle, "MinusCircle", true);
export const MinusIcon = wrap(PhMinus, "MinusIcon", false);
export const MoonIcon = wrap(PhMoon, "MoonIcon", true);
export const MoreHorizontal = wrap(PhDotsThree, "MoreHorizontal", false);
export const MoreHorizontalIcon = wrap(PhDotsThree, "MoreHorizontalIcon", false);
export const MousePointerClick = wrap(PhCursorClick, "MousePointerClick", true);
export const NotebookPenIcon = wrap(PhNotePencil, "NotebookPenIcon", true);
export const PackageOpen = wrap(PhPackage, "PackageOpen", true);
export const PanelLeftIcon = wrap(PhSidebarSimple, "PanelLeftIcon", true);
export const Paperclip = wrap(PhPaperclip, "Paperclip", true);
export const PenLine = wrap(PhPencilLine, "PenLine", true);
export const Play = wrap(PhPlay, "Play", true);
export const PlayCircle = wrap(PhPlayCircle, "PlayCircle", true);
export const Plug = wrap(PhPlug, "Plug", true);
export const PlugZap = wrap(PhPlugsConnected, "PlugZap", true);
export const Plus = wrap(PhPlus, "Plus", false);
export const PlusIcon = wrap(PhPlus, "PlusIcon", false);
export const Radio = wrap(PhBroadcast, "Radio", true);
export const RefreshCw = wrap(PhArrowsClockwise, "RefreshCw", true);
export const Rocket = wrap(PhRocketLaunch, "Rocket", true);
export const RotateCcw = wrap(PhArrowCounterClockwise, "RotateCcw", true);
export const Save = wrap(PhFloppyDisk, "Save", true);
export const ScaleIcon = wrap(PhScales, "ScaleIcon", true);
export const ScrollTextIcon = wrap(PhScroll, "ScrollTextIcon", true);
export const Search = wrap(PhMagnifyingGlass, "Search", true);
export const SearchIcon = wrap(PhMagnifyingGlass, "SearchIcon", true);
export const SearchX = wrap(PhMagnifyingGlassMinus, "SearchX", true);
export const SendIcon = wrap(PhPaperPlaneTilt, "SendIcon", true);
export const Settings = wrap(PhGear, "Settings", true);
export const Settings2 = wrap(PhSlidersHorizontal, "Settings2", true);
export const ShieldCheck = wrap(PhShieldCheck, "ShieldCheck", true);
export const ShieldIcon = wrap(PhShield, "ShieldIcon", true);
export const Sparkles = wrap(PhSparkle, "Sparkles", true);
export const SparklesIcon = wrap(PhSparkle, "SparklesIcon", true);
export const Split = wrap(PhArrowsSplit, "Split", true);
export const Square = wrap(PhSquare, "Square", true);
export const Mic = wrap(PhMicrophone, "Mic", false);
export const Store = wrap(PhStorefront, "Store", true);
export const SunIcon = wrap(PhSun, "SunIcon", true);
export const Target = wrap(PhTarget, "Target", true);
export const Trash = wrap(PhTrash, "Trash", true);
export const Trash2 = wrap(PhTrash, "Trash2", true);
export const TrendingUp = wrap(PhTrendUp, "TrendingUp", true);
export const TriangleAlert = wrap(PhWarning, "TriangleAlert", true);
export const TriangleAlertIcon = wrap(PhWarning, "TriangleAlertIcon", true);
export const Unplug = wrap(PhPlugs, "Unplug", true);
export const Upload = wrap(PhUploadSimple, "Upload", true);
export const User = wrap(PhUser, "User", true);
export const UserX = wrap(PhUserMinus, "UserX", true);
export const Users = wrap(PhUsers, "Users", true);
export const Wallet = wrap(PhWallet, "Wallet", true);
export const WifiOff = wrap(PhWifiSlash, "WifiOff", true);
export const WifiOffIcon = wrap(PhWifiSlash, "WifiOffIcon", true);
export const WrenchIcon = wrap(PhWrench, "WrenchIcon", true);
export const X = wrap(PhX, "X", false);
export const XCircle = wrap(PhXCircle, "XCircle", true);
export const XIcon = wrap(PhX, "XIcon", false);
export const Zap = wrap(PhLightning, "Zap", true);

