import * as Clipboard from 'expo-clipboard';

export async function copyTextToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
