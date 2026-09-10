use std::{
    io,
    net::{TcpListener, UdpSocket},
    thread,
    time::Duration,
};

/// Each mode receives fresh loopback listeners, so prior control packets cannot count.
pub(super) struct Network {
    tcp: TcpListener,
    udp: UdpSocket,
}

impl Network {
    pub fn new() -> io::Result<Self> {
        let tcp = TcpListener::bind("127.0.0.1:0")?;
        let udp = UdpSocket::bind("127.0.0.1:0")?;
        tcp.set_nonblocking(true)?;
        udp.set_nonblocking(true)?;
        Ok(Self { tcp, udp })
    }
    pub fn tcp_port(&self) -> io::Result<u16> {
        Ok(self.tcp.local_addr()?.port())
    }
    pub fn udp_port(&self) -> io::Result<u16> {
        Ok(self.udp.local_addr()?.port())
    }

    pub fn observe(&self) -> io::Result<serde_json::Value> {
        thread::sleep(Duration::from_millis(100));
        let tcp_received = match self.tcp.accept() {
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => false,
            Err(error) => return Err(error),
        };
        let mut data = [0u8; 16];
        let udp_received = match self.udp.recv(&mut data) {
            Ok(size) if &data[..size] == b"probe" => true,
            Ok(_) => return Err(io::Error::other("unexpected UDP probe payload")),
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => false,
            Err(error) => return Err(error),
        };
        Ok(serde_json::json!({ "tcp": tcp_received, "udp": udp_received }))
    }
}
