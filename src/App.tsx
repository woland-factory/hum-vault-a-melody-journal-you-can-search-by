import CaptureScreen from "./components/CaptureScreen";
import SongbookScreen from "./components/SongbookScreen";
import SearchScreen from "./components/SearchScreen";
import SettingsScreen from "./components/SettingsScreen";
import EntryDetailScreen from "./components/EntryDetailScreen";
import { useHashRoute } from "./router/useHashRoute";

export default function App() {
  const route = useHashRoute();
  switch (route.name) {
    case "songbook":
      return <SongbookScreen />;
    case "search":
      return <SearchScreen />;
    case "settings":
      return <SettingsScreen />;
    case "entry":
      return <EntryDetailScreen id={route.id} />;
    case "capture":
    default:
      return <CaptureScreen />;
  }
}
