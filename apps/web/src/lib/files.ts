export async function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file as text"));
    reader.readAsText(file);
  });
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await readTextFile(file);
  return JSON.parse(text) as unknown;
}

