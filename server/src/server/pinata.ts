export class Pinata {
  constructor(private readonly jwt: string) {}
  async upload(
    name: string,
    content: Buffer | string,
    type: string,
  ): Promise<string> {
    const form = new FormData();
    form.set("network", "public");
    form.set("name", name);
    form.set("file", new Blob([content], { type }), name);
    const response = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: form,
    });
    if (!response.ok)
      throw new Error(
        `Pinata upload failed (${response.status}): ${await response.text()}`,
      );
    const body = (await response.json()) as { data?: { cid?: string } };
    const cid = body.data?.cid;
    if (!cid) throw new Error("Pinata response did not include a CID");
    return `ipfs://${cid}`;
  }
}
