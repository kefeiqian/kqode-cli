fn main() {
    let version_requested = std::env::args()
        .skip(1)
        .any(|argument| argument == "--version" || argument == "-V");

    if version_requested {
        println!("kqode {}", env!("CARGO_PKG_VERSION"));
    } else {
        println!("KQode CLI");
        println!();
        println!("Runtime commands are not available in this build yet.");
    }
}
