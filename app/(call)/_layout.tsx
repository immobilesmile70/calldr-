import { Stack } from 'expo-router';

export default function CallLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0E0E11' },
        presentation: 'fullScreenModal',
      }}
    />
  );
}
