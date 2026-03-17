declare module 'ansis' {
  interface AnsisInstance {
    (input: string): string;
    bold: AnsisInstance;
    red: AnsisInstance;
    green: AnsisInstance;
    yellow: AnsisInstance;
  }

  const ansis: AnsisInstance;
  export default ansis;
}

