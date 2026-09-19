import { KeyboardAvoidingView, ScrollView, type ScrollViewProps } from 'react-native';

// Scroll container for any screen with text inputs: pads its bottom by
// whatever part of the keyboard overlaps it (Android runs edge-to-edge, so the
// window no longer resizes for the keyboard on its own), and the native
// ScrollView then keeps the focused input in view as it shrinks.
export function KeyboardScroll({
  children,
  ...props
}: ScrollViewProps & { className?: string; contentContainerClassName?: string }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" className="flex-1" {...props}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
