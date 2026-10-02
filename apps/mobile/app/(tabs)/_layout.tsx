import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useLang } from '../../src/i18n';

function TabIcon(props: { icon: string; color: string }) {
  return <Text style={{ fontSize: 22, color: props.color }}>{props.icon}</Text>;
}

export default function TabsLayout() {
  const { t } = useLang();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1D4ED8',
        tabBarInactiveTintColor: '#6B7280',
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('Dashboard'),
          tabBarIcon: ({ color }) => <TabIcon icon="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: t('Inventory'),
          tabBarIcon: ({ color }) => <TabIcon icon="📦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: t('Billing'),
          tabBarIcon: ({ color }) => <TabIcon icon="🧾" color={color} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t('Customers'),
          tabBarIcon: ({ color }) => <TabIcon icon="👥" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('More'),
          tabBarIcon: ({ color }) => <TabIcon icon="⋯" color={color} />,
        }}
      />
    </Tabs>
  );
}
