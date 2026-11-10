import Editor from "@/components/editor";
export default function Page() {
  return <Editor localOnly={process.env.CUTWISE_STATIC_EXPORT === "1"} />;
}
